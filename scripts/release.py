"""Build a source-only Community ZIP using the Python standard library."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import stat
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    '.dockerignore', '.env.example', '.gitignore', 'Caddyfile', 'Dockerfile',
    'compose.yaml', 'package.json', 'package-lock.json', 'server.mjs',
    'LICENSE', 'NOTICE', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md',
    'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md',
    '.github/dependabot.yml',
)
DIRECTORIES = ('lib', 'public', 'scripts', 'tests', 'docs', '.github/workflows')
FORBIDDEN_PARTS = {
    '.git', 'node_modules', '__pycache__', 'data', 'backups', 'artifacts',
    'build', 'dist', 'downloads', 'apple', 'ios', 'android', 'research',
    'raw-captures', 'transcripts', 'prompts', 'apple-roots',
}
PROPRIETARY = {
    'billing.mjs', 'billing-portfolios.mjs', 'stripe-billing.mjs', 'plans.mjs',
    'seat-plans.mjs', 'sample-login.mjs', 'push.mjs', 'ai-meter.mjs',
    'billing-portfolio.js', 'extra-seats.js', 'subscription-plans.js',
    'web-subscriptions.js', 'support-link.js',
}
EXTENSIONS = {'.mjs', '.js', '.css', '.html', '.svg', '.json', '.md', '.yml', '.yaml', '.py', '.txt'}
PATTERNS = {
    'private key': re.compile(r'-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'),
    'provider credential': re.compile(
        r'\b(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{30,}'
        r'|github_pat_[A-Za-z0-9_]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16}'
        r'|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{20,})\b'),
    'literal bearer token': re.compile(r'\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{16,}\b'),
    'credential in URL': re.compile(r'https?://[^\s/:@\x27"`<>{},]+:[^\s/@\x27"`<>{},]+@'),
    'private workstation path': re.compile(r'/(?:Users|home)/[A-Za-z0-9_][^\s\x27"`]*|/(?:Volumes)/[^\s\x27"`]+'),
}
OPERATOR_HOST = re.compile(r'https?://(?:[\w-]+\.)*(?:dowisuite\.com|dayella\.co)(?:[/:\s\x27"`]|$)|@dowisuite\.com')
SECRET_ASSIGNMENT = re.compile(r'^([A-Z][A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|ENCRYPTION_KEY)[A-Z0-9_]*)\s*=\s*(.+)$')


def collect_files(root=ROOT):
    """Only explicit source locations are eligible; never follow symlinks."""
    result = {}

    def visit(file):
        relative = file.relative_to(root)
        if file.is_symlink() or any((root / parent).is_symlink() for parent in relative.parents if parent != Path('.')):
            raise ValueError(f'{relative}: symlinks are not allowed')
        if '__pycache__' in relative.parts:
            return
        if set(relative.parts) & FORBIDDEN_PARTS:
            raise ValueError(f'{relative}: private/generated path in source tree')
        if file.is_dir():
            for child in sorted(file.iterdir()):
                visit(child)
            return
        if not file.is_file() or not stat.S_ISREG(file.stat().st_mode):
            raise ValueError(f'{relative}: expected a regular source file')
        if file.name in PROPRIETARY or (file.name.startswith('.env') and relative.as_posix() != '.env.example'):
            raise ValueError(f'{relative}: private configuration or hosted implementation')
        if relative.as_posix() not in FILES and file.suffix not in EXTENSIONS:
            raise ValueError(f'{relative}: unsupported source file type')
        result[relative.as_posix()] = file.read_bytes()

    for name in (*FILES, *DIRECTORIES):
        visit(root / name)
    return dict(sorted(result.items()))


def audit(files):
    """Report locations and rule names, never the matched secret."""
    errors = []
    for name, content in files.items():
        try:
            source = content.decode('utf-8')
        except UnicodeDecodeError:
            errors.append(f'{name}: binary content is not allowed')
            continue
        if '\x00' in source:
            errors.append(f'{name}: binary content is not allowed')
        for label, pattern in PATTERNS.items():
            for match in pattern.finditer(source):
                line = source.count('\n', 0, match.start()) + 1
                errors.append(f'{name}:{line}: {label}')
        if name == 'server.mjs' or name.startswith(('lib/', 'public/')):
            if OPERATOR_HOST.search(source):
                errors.append(f'{name}: hosted operator endpoint in runtime source')
        if name == '.env.example':
            for number, line in enumerate(source.splitlines(), 1):
                if SECRET_ASSIGNMENT.match(line):
                    errors.append(f'{name}:{number}: secret default must be blank')
    package = json.loads(files['package.json'])
    lock = json.loads(files['package-lock.json'])
    if package.get('license') != 'AGPL-3.0-only':
        errors.append('package.json: preserve the existing Community license')
    if package['version'] != lock['version'] or package['version'] != lock['packages']['']['version']:
        errors.append('package-lock.json: version differs from package.json')
    if any(name in package.get('dependencies', {}) for name in ('stripe', '@apple/app-store-server-library')):
        errors.append('package.json: hosted billing dependency in Community edition')
    return errors


def build_archive(files, output):
    package = json.loads(files['package.json'])
    version = package['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?', version):
        raise ValueError('package.json: invalid release version')
    prefix = f'dowi-quotes-community-{version}'
    manifest = {
        'name': package['name'], 'version': version, 'license': package['license'],
        'scope': 'Web and backend source; no Git history or runtime data',
        'files': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()},
    }
    entries = {**files, 'RELEASE-MANIFEST.json': (json.dumps(manifest, indent=2) + '\n').encode()}
    output = Path(output).resolve()
    for directory in DIRECTORIES:
        if output == ROOT / directory or ROOT / directory in output.parents:
            raise ValueError('Release output must be outside the included source directories')
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'{prefix}.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as handle:
        for name, data in sorted(entries.items()):
            entry = zipfile.ZipInfo(f'{prefix}/{name}', date_time=(2026, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = (stat.S_IFREG | 0o644) << 16
            handle.writestr(entry, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
    return archive, digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--output', type=Path, help='Directory for the ZIP and SHA-256 checksum')
    args = parser.parse_args()
    try:
        files = collect_files()
        errors = audit(files)
        if errors:
            print('\n'.join(errors), file=sys.stderr)
            return 1
        print(f'Checked {len(files)} source files; no configured sensitive patterns found.')
        if args.output:
            archive, digest = build_archive(files, args.output)
            print(f'Created {archive}\nSHA-256: {digest}')
        return 0
    except (ValueError, OSError, KeyError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
