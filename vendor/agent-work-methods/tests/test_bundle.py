"""檔案用途：驗證單獨取用與真實缺檔／越界失敗。所在層：套件測試。主要關聯：scripts/check.py。"""
import importlib.util
import shutil
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bundle_check", ROOT / "scripts/check.py")
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class BundleTests(unittest.TestCase):
    def copy_skill(self, directory, name="awm-onboarding"):
        destination = Path(directory) / "skills" / name
        shutil.copytree(ROOT / "skills" / name, destination)
        return destination

    def test_collection(self):
        self.assertEqual(check.validate_repository(ROOT), [])

    def test_individual_skills_survive_unrelated_project_layouts(self):
        # 只複製一個 skill；不帶根文件、其他 skill 或來源產品，才會抓到隱藏相依。
        for project, instruction, commands in [
            ("python-cli", "Use the existing Python CLI and preserve input files.", "check:\n\tpython3 -m unittest\n"),
            ("static-site", "Use browser checks and the existing styles.", "check:\n\t./verify-site\n"),
            ("rust-tool", "Keep the existing stable branch workflow.", "check:\n\tcargo test\n"),
        ]:
            for source in (ROOT / "skills").iterdir():
                with self.subTest(project=project, skill=source.name), tempfile.TemporaryDirectory() as directory:
                    parent = Path(directory) / project
                    parent.mkdir()
                    policy = parent / "PROJECT_RULES.md"
                    policy.write_text(instruction)
                    (parent / "Makefile").write_text(commands)
                    skill = self.copy_skill(parent, source.name)
                    self.assertEqual(check.validate_skill(skill), [])
                    self.assertEqual(policy.read_text(), instruction)
                    self.assertEqual((parent / "Makefile").read_text(), commands)

    def test_missing_reference_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            skill = self.copy_skill(directory)
            (skill / "references/guide.md").unlink()
            self.assertTrue(any("missing-reference" in error for error in check.validate_skill(skill)))

    def test_escape_is_rejected_even_when_target_exists(self):
        with tempfile.TemporaryDirectory() as directory:
            skill = self.copy_skill(directory)
            (skill.parent / "outside.md").write_text("synthetic unrelated document")
            with (skill / "SKILL.md").open("a") as stream:
                stream.write("\n[hidden dependency](../outside.md)\n")
            self.assertTrue(any("escaped-reference" in error for error in check.validate_skill(skill)))

    def test_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            skill = self.copy_skill(directory)
            target = Path(directory) / "outside.txt"
            target.write_text("synthetic outside content")
            (skill / "linked.txt").symlink_to(target)
            self.assertTrue(any("symlink" in error for error in check.validate_skill(skill)))

    def test_product_dependency_is_rejected_in_instructions(self):
        with tempfile.TemporaryDirectory() as directory:
            skill = self.copy_skill(directory)
            with (skill / "references/guide.md").open("a") as stream:
                stream.write("\nRead " + "RECORD_" + "COMPARE.md before all changes.\n")
            self.assertTrue(any("product-dependency" in error for error in check.validate_skill(skill)))

    def test_linked_entry_is_rejected_before_any_content_read(self):
        with tempfile.TemporaryDirectory() as directory:
            skill = self.copy_skill(directory)
            target = Path(directory) / "outside.md"
            target.write_text("synthetic outside content")
            entry = skill / "SKILL.md"
            entry.unlink()
            entry.symlink_to(target)
            # read_text 一旦被呼叫就失敗，證明拒絕不只是讀完外部內容後才補報錯。
            with patch.object(Path, "read_text", side_effect=AssertionError("unexpected read")):
                self.assertTrue(any("symlink" in error for error in check.validate_skill(skill)))

    def test_invalid_metadata_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            skill = self.copy_skill(directory)
            entry = skill / "SKILL.md"
            entry.write_text(entry.read_text().replace('name: "awm-onboarding"', 'name: "different-name"'))
            self.assertTrue(any("invalid-frontmatter" in error for error in check.validate_skill(skill)))

    def test_sensitive_patterns_are_not_reprinted(self):
        # 合成憑證只在記憶體拼接；錯誤訊息只回傳類別，不能再次散播命中內容。
        credential = "ghp_" + "x" * 36
        self.assertEqual(check.public_problems(Path("fixture.md"), credential), ["credential-pattern"])
        self.assertEqual(check.public_problems(Path(".env.local"), ""), ["protected-file"])
        self.assertEqual(check.public_problems(Path("guide.md"), "/Users/example/project"), [])


if __name__ == "__main__":
    unittest.main()
