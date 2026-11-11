# assets

Files that paper and question records point to (PRD 8.2 and 8.3). Nothing is required here
for the demo content, which is plain HTML inside the JSON.

| Folder | Holds | Referenced by |
| --- | --- | --- |
| `pdfs/` | Full question papers and mark schemes | `full_paper_pdf_url`, `full_mark_scheme_pdf_url` on a paper |
| `papers/` | Images of individual questions cropped from a paper | `content.question_image_url` on a question |
| `ms/` | Images of the matching mark scheme extracts | `content.mark_scheme_image_url` on a question |

Use paths relative to the site root, for example `assets/pdfs/9PH0_2024_P1.pdf`.

Past papers and mark schemes are the copyright of their exam boards. Only add files you
are allowed to host; otherwise leave the PDF fields empty and the site links to the board.
