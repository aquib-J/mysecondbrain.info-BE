# Document Processing Scripts

This directory contains Python scripts for document processing used by the mysecondbrain.info backend.

## PDF Processor

The `pdf_processor.py` script provides text extraction capabilities for PDF and text files. It processes documents into chunks that can be used for vector embedding and storage.

## Setup

### Prerequisites

- Python 3.8 or higher
- PyPDF2 library

### Installation

1. Install Python dependencies:

```bash
pip install PyPDF2
```

### Usage

The script can be used directly from the command line:

```bash
python3 pdf_processor.py /path/to/file.pdf --output /path/to/output.json
```

Or it can be called from Node.js using the `document.processor.service.js` service.

## Output Format

The script outputs a JSON file containing an array of text chunks with metadata:

```json
[
  {
    "text": "Sample extracted text...",
    "metadata": {
      "source": "document.pdf",
      "page": 1,
      "total_pages": 10,
      "format": "pdf"
    }
  },
  {
    "text": "More text from another page...",
    "metadata": {
      "source": "document.pdf",
      "page": 2,
      "total_pages": 10,
      "format": "pdf"
    }
  }
]
```

## Extending Support

To add support for additional file types, modify the `pdf_processor.py` script and add a new extraction function similar to `extract_text_from_pdf()`. 