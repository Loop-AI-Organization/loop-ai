import unittest

from loop_ai.orchestrator.orchestrator import _extract_file_text


class FileContentExtractionTest(unittest.TestCase):
    def test_decodes_text_files(self):
        self.assertEqual(
            _extract_file_text(b"hello\nworld", content_type="text/plain", file_name="notes.txt"),
            "hello\nworld",
        )

    def test_empty_binary_pdf_falls_back_to_empty_text(self):
        self.assertEqual(
            _extract_file_text(b"%PDF-1.4\n%%EOF", content_type="application/pdf", file_name="empty.pdf"),
            "%PDF-1.4\n%%EOF",
        )


if __name__ == "__main__":
    unittest.main()
