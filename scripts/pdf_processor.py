#!/usr/bin/env python3

import sys
import json
import os
import traceback
from PyPDF2 import PdfReader
import argparse
from typing import List, Dict, Any, Optional
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('pdf_processor')

def extract_text_from_pdf(pdf_path: str) -> List[Dict[str, Any]]:
    """
    Extract text from PDF file and return as a list of chunks with metadata
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        List of dictionaries containing text chunks and metadata
    """
    try:
        logger.info(f"Processing PDF: {pdf_path}")
        reader = PdfReader(pdf_path)
        num_pages = len(reader.pages)
        
        results = []
        
        # Process each page
        for i, page in enumerate(reader.pages):
            page_num = i + 1
            text = page.extract_text()
            
            if not text or len(text.strip()) == 0:
                logger.warning(f"Page {page_num} has no extractable text")
                continue
                
            # Get page metadata if available
            metadata = {}
            if hasattr(page, 'get_contents'):
                metadata = page.get_contents()
                
            # Create a chunk for the page
            chunk = {
                "text": text,
                "metadata": {
                    "source": os.path.basename(pdf_path),
                    "page": page_num,
                    "total_pages": num_pages,
                    "format": "pdf"
                }
            }
            
            results.append(chunk)
            
        logger.info(f"Successfully extracted text from {len(results)} pages")
        return results
        
    except Exception as e:
        logger.error(f"Error processing PDF: {e}")
        logger.error(traceback.format_exc())
        raise

def extract_text_from_txt(txt_path: str) -> List[Dict[str, Any]]:
    """
    Extract text from a TXT file and return as a list of chunks with metadata
    
    Args:
        txt_path: Path to the TXT file
        
    Returns:
        List of dictionaries containing text chunks and metadata
    """
    try:
        logger.info(f"Processing TXT: {txt_path}")
        
        with open(txt_path, 'r', encoding='utf-8', errors='replace') as file:
            text = file.read()
        
        if not text or len(text.strip()) == 0:
            logger.warning(f"TXT file has no text content")
            return []
            
        # Split into chunks (approximately 1000 characters per chunk)
        chunk_size = 1000
        chunks = []
        
        for i in range(0, len(text), chunk_size):
            chunk_text = text[i:i+chunk_size]
            
            # Create a chunk
            chunk = {
                "text": chunk_text,
                "metadata": {
                    "source": os.path.basename(txt_path),
                    "chunk": i // chunk_size + 1,
                    "total_chunks": (len(text) + chunk_size - 1) // chunk_size,
                    "format": "txt"
                }
            }
            
            chunks.append(chunk)
            
        logger.info(f"Successfully extracted {len(chunks)} chunks from text file")
        return chunks
        
    except Exception as e:
        logger.error(f"Error processing TXT: {e}")
        logger.error(traceback.format_exc())
        raise

def extract_text_from_json(json_path: str) -> List[Dict[str, Any]]:
    """
    Extract text from a JSON file and return as a list of chunks with metadata
    
    Args:
        json_path: Path to the JSON file
        
    Returns:
        List of dictionaries containing text chunks and metadata
    """
    try:
        logger.info(f"Processing JSON: {json_path}")
        
        with open(json_path, 'r', encoding='utf-8', errors='replace') as file:
            json_content = json.load(file)
        
        # Convert JSON to formatted string for better readability
        text = json.dumps(json_content, indent=2)
        
        # Handle both array and object formats
        json_items = json_content if isinstance(json_content, list) else [json_content]
        
        chunks = []
        
        # Process each item as a separate chunk
        for i, item in enumerate(json_items):
            # Flatten nested structures for better search capability
            flattened = flatten_json(item)
            
            # Convert flattened structure to text
            item_text = "\n".join([f"{k}: {v}" for k, v in flattened.items()])
            
            # Create a chunk
            chunk = {
                "text": item_text,
                "metadata": {
                    "source": os.path.basename(json_path),
                    "item_index": i,
                    "total_items": len(json_items),
                    "format": "json",
                    "original_item": item
                }
            }
            
            chunks.append(chunk)
        
        logger.info(f"Successfully extracted {len(chunks)} chunks from JSON file")
        return chunks
        
    except Exception as e:
        logger.error(f"Error processing JSON: {e}")
        logger.error(traceback.format_exc())
        raise

def flatten_json(obj: Any, prefix: str = '') -> Dict[str, Any]:
    """
    Flatten a nested JSON object to dot notation
    
    Args:
        obj: The nested object to flatten
        prefix: Current path prefix
        
    Returns:
        Flattened dictionary with dot notation keys
    """
    result = {}
    
    if isinstance(obj, dict):
        for key, value in obj.items():
            new_key = f"{prefix}.{key}" if prefix else key
            
            if isinstance(value, (dict, list)):
                result.update(flatten_json(value, new_key))
            else:
                result[new_key] = value
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            new_key = f"{prefix}[{i}]"
            
            if isinstance(item, (dict, list)):
                result.update(flatten_json(item, new_key))
            else:
                result[new_key] = item
    else:
        result[prefix] = obj
        
    return result

def split_into_chunks(texts: List[Dict[str, Any]], chunk_size: int = 1000, overlap: int = 200) -> List[Dict[str, Any]]:
    """
    Split longer texts into smaller chunks with overlap
    
    Args:
        texts: List of dictionaries containing text and metadata
        chunk_size: Maximum size of each chunk
        overlap: Number of characters to overlap between chunks
        
    Returns:
        List of dictionaries containing smaller text chunks with updated metadata
    """
    results = []
    
    for item in texts:
        text = item["text"]
        
        # If text is smaller than chunk size, keep as is
        if len(text) <= chunk_size:
            results.append(item)
            continue
            
        # Split into chunks
        chunks = []
        for i in range(0, len(text), chunk_size - overlap):
            if i > 0 and i + chunk_size > len(text):
                # Skip small final chunk
                break
                
            chunk_text = text[i:min(i + chunk_size, len(text))]
            chunk_num = len(chunks) + 1
            
            # Create a chunk with updated metadata
            chunk = {
                "text": chunk_text,
                "metadata": {
                    **item["metadata"],
                    "chunk": chunk_num,
                    "total_chunks_from_original": (len(text) + chunk_size - 1) // (chunk_size - overlap),
                    "original_page": item["metadata"].get("page", 1)
                }
            }
            
            chunks.append(chunk)
            
        results.extend(chunks)
    
    return results

def process_document(file_path: str, output_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Process a document and return chunks of text with metadata
    
    Args:
        file_path: Path to the document
        output_path: Optional path to save output JSON
        
    Returns:
        List of text chunks with metadata
    """
    try:
        if not os.path.exists(file_path):
            raise ValueError(f"File does not exist: {file_path}")
            
        file_ext = os.path.splitext(file_path)[1].lower()
        
        logger.info(f"Processing file with extension: {file_ext}")
        
        # Extract text based on file type
        if file_ext == '.pdf':
            chunks = extract_text_from_pdf(file_path)
        elif file_ext == '.txt':
            chunks = extract_text_from_txt(file_path)
        elif file_ext == '.json':
            chunks = extract_text_from_json(file_path)
        else:
            # Default to treating unknown files as text
            logger.warning(f"Unsupported file extension: {file_ext}, treating as text")
            chunks = extract_text_from_txt(file_path)
        
        # Split into smaller chunks if needed
        chunks = split_into_chunks(chunks)
        
        # Save to output file if specified
        if output_path:
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(chunks, f, indent=2)
            logger.info(f"Saved output to {output_path}")
        
        return chunks
    except Exception as e:
        logger.error(f"Error processing document: {e}")
        logger.error(traceback.format_exc())
        raise

def main():
    parser = argparse.ArgumentParser(description='Process documents to extract text')
    parser.add_argument('file_path', help='Path to the document to process')
    parser.add_argument('--output', '-o', help='Path to save output JSON')
    args = parser.parse_args()
    
    try:
        chunks = process_document(args.file_path, args.output)
        print(json.dumps({"status": "success", "chunk_count": len(chunks)}))
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main() 