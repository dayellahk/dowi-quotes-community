import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release', ROOT / 'scripts/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def fixture(self, root):
        for name in release.FILES:
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            (root / name).write_bytes((ROOT / name).read_bytes())
        for name in release.DIRECTORIES:
            (root / name).mkdir(parents=True, exist_ok=True)
        (root / 'lib/example.mjs').write_text('export const example = true;\n')

    def test_private_root_files_and_git_history_are_never_collected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.fixture(root)
            (root / '.env').write_text('private configuration')
            (root / 'signing.p8').write_text('private signing file')
            for name in ('data', '.git', 'node_modules', 'marketing'):
                (root / name).mkdir()
                (root / name / 'private.json').write_text('private records')
            files = release.collect_files(root)
            self.assertIn('lib/example.mjs', files)
            self.assertNotIn('.env', files)
            self.assertFalse(any(set(Path(name).parts) & release.FORBIDDEN_PARTS for name in files))

    def test_symlink_cannot_pull_private_file_into_public_tree(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.fixture(root)
            (root / '.env').write_text('private')
            (root / 'public/leak.js').symlink_to(root / '.env')
            with self.assertRaisesRegex(ValueError, 'symlinks'):
                release.collect_files(root)

    def test_private_files_and_billing_inside_included_tree_fail_closed(self):
        for name in ('public/.env', 'lib/plans.mjs', 'public/secret.p8', 'lib/data', 'public/unreviewed.png'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                self.fixture(root)
                (root / name).write_text('private')
                with self.assertRaises(ValueError):
                    release.collect_files(root)

    def test_credential_findings_never_echo_matched_values(self):
        files = release.collect_files()
        values = [
            'sk_' + 'live_' + 'a' * 32,
            'gh' + 'p_' + 'a' * 36,
            'AK' + 'IA' + 'A' * 16,
            '-----BEGIN ' + 'PRIVATE KEY-----',
            'https://' + 'user:private-password@' + 'example.test',
            '/' + 'Users/private-person/private-project',
        ]
        for value in values:
            with self.subTest(prefix=value[:4]):
                errors = release.audit({**files, 'lib/injected.mjs': value.encode()})
                self.assertTrue(any('lib/injected.mjs' in error for error in errors))
                self.assertNotIn(value, '\n'.join(errors))

    def test_filled_example_secrets_and_hosted_endpoints_are_rejected(self):
        files = release.collect_files()
        errors = release.audit({**files, '.env.example': b'TOKEN_ENCRYPTION_KEY=nonempty\n'})
        self.assertTrue(any('secret default' in error for error in errors))
        endpoint = 'https://' + 'api.quotes.' + 'dowisuite.com'
        errors = release.audit({**files, 'public/injected.js': endpoint.encode()})
        self.assertTrue(any('hosted operator endpoint' in error for error in errors))

    def test_current_distribution_passes_audit(self):
        self.assertEqual(release.audit(release.collect_files()), [])

    def test_archive_is_reproducible_and_manifest_covers_every_source_file(self):
        files = release.collect_files()
        with tempfile.TemporaryDirectory() as folder:
            archive, first = release.build_archive(files, folder)
            original = archive.read_bytes()
            _, second = release.build_archive(files, folder)
            self.assertEqual(first, second)
            self.assertEqual(original, archive.read_bytes())
            self.assertEqual(first, hashlib.sha256(original).hexdigest())
            with zipfile.ZipFile(archive) as handle:
                names = handle.namelist()
                self.assertTrue(all(not name.startswith('/') and '..' not in Path(name).parts for name in names))
                prefix = names[0].split('/')[0] + '/'
                manifest = json.loads(handle.read(prefix + 'RELEASE-MANIFEST.json'))
                self.assertEqual(set(manifest['files']), set(files))
                self.assertEqual(len(names), len(files) + 1)
                for name, digest in manifest['files'].items():
                    self.assertEqual(hashlib.sha256(handle.read(prefix + name)).hexdigest(), digest)


if __name__ == '__main__':
    unittest.main()
