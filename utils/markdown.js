/**
 * Markdown utilities for serializing and deserializing markdown content
 */
import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { encode, decode } from 'html-entities';
import TurndownService from 'turndown';
import Logger from './Logger.js';

// Create a virtual DOM for DOMPurify using jsdom
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);
const logger = new Logger();

// Configure marked for security and consistent output
marked.setOptions({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Line breaks are rendered as <br>
    smartLists: true, // Better list handling
    smartypants: true, // Typographic punctuation
    headerIds: false, // Don't add ids to headers (security)
});

// Security configuration for DOMPurify
const ALLOWED_TAGS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
    'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img',
    'del', 'dl', 'dt', 'dd', 'sup', 'sub', 'kbd', 'q'
];

const ALLOWED_ATTR = [
    'href', 'name', 'target', 'title', 'class', 'id', 'alt', 'width', 'height',
    'dir', 'lang', 'align', 'valign', 'hreflang', 'rel'
];

// Configure DOMPurify
const purifyConfig = {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'javascript:', 'xlink:href'],
    ADD_ATTR: ['target'],
    USE_PROFILES: { html: true },
    RETURN_TRUSTED_TYPE: false,
    ALLOW_DATA_ATTR: false
};

// Initialize turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
});

// Add custom rules to turndown for code blocks
turndownService.addRule('codeBlocks', {
    filter: node => node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE',
    replacement: (content, node) => {
        const language = node.firstChild.className?.replace(/^language-/, '') || '';
        return `\n\`\`\`${language}\n${node.firstChild.textContent}\n\`\`\`\n`;
    }
});

/**
 * Serialize markdown content for storage in the database
 * @param {string} markdown - The markdown content to serialize
 * @returns {string} - The serialized markdown
 */
function serializeMarkdown(markdown) {
    if (!markdown) return '';

    try {
        // Simple sanitization to remove potentially dangerous content
        const cleaned = DOMPurify.sanitize(markdown);
        return cleaned;
    } catch (error) {
        logger.error('Error serializing markdown', { error: error.message });
        return markdown; // Return original if error occurs
    }
}

/**
 * Deserialize stored markdown content and convert to HTML
 * @param {string} serialized - The serialized markdown content
 * @returns {string} - The deserialized and sanitized markdown as HTML
 */
function deserializeMarkdown(serialized) {
    if (!serialized) return '<p></p>'; // Return empty paragraph for empty input

    try {
        // Convert markdown to HTML using marked
        const html = marked.parse(serialized);

        // Sanitize HTML to prevent XSS attacks
        const sanitized = DOMPurify.sanitize(html, purifyConfig);

        // Make all external links open in a new tab
        const enhanced = sanitized.replace(
            /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["']([^>]*)>/gi,
            (match, url, rest) => {
                if (url.startsWith('#') || url.startsWith('/')) {
                    return match; // Skip internal links
                }
                if (!rest.includes('target=')) {
                    return `<a href="${url}" target="_blank" rel="noopener noreferrer"${rest}>`;
                }
                if (!rest.includes('rel=')) {
                    return `<a href="${url}"${rest} rel="noopener noreferrer">`;
                }
                return match;
            }
        );

        return enhanced;;
        // // Remove literal newlines from HTML while preserving structure
        // // This prevents newlines from being rendered as text in browsers
        // const cleanedHtml = enhanced
        //     // Remove newlines between HTML tags
        //     .replace(/>\n</g, '><')
        //     // Remove newlines at the start of the text
        //     .replace(/\n+/g, ' ')
        //     // Normalize spaces
        //     .replace(/\s+/g, ' ')
        //     // Ensure proper spacing for inline elements
        //     .replace(/<\/li><li>/g, '</li>\n<li>')
        //     .replace(/<\/h[1-6]><p>/g, '</h$1>\n<p>')
        //     .replace(/<\/p><p>/g, '</p>\n<p>')
        //     .replace(/<\/ul><h/g, '</ul>\n<h')
        //     .replace(/<\/ol><h/g, '</ol>\n<h')
        //     .replace(/<\/p><h/g, '</p>\n<h')
        //     .replace(/<\/h[1-6]><h/g, '</h$1>\n<h');

        // return cleanedHtml;
    } catch (error) {
        logger.error('Error deserializing markdown', { error: error.message });
        return `<p>Error rendering content: ${encode(String(error.message))}</p>`;
    }
}

/**
 * Convert markdown to sanitized HTML
 * @param {string} markdown - The markdown content to convert
 * @returns {string} - The sanitized HTML
 */
function markdownToHtml(markdown) {
    return deserializeMarkdown(markdown);
}

/**
 * Convert HTML to markdown
 * @param {string} html - The HTML content to convert
 * @returns {string} - The markdown content
 */
function htmlToMarkdown(html) {
    if (!html) return '';

    try {
        // Sanitize the HTML first
        const sanitized = DOMPurify.sanitize(html, purifyConfig);

        // Convert to markdown
        return turndownService.turndown(sanitized);
    } catch (error) {
        logger.error('Error converting HTML to markdown', { error: error.message });
        return `Error converting content: ${error.message}`;
    }
}

/**
 * Get instructions for formatting responses in markdown
 * @returns {string} - The markdown formatting instructions
 */
function getMarkdownInstructionPrompt() {
    return `
Format your response using markdown:
- Use # for main headings, ## for subheadings, etc.
- Use **bold** for emphasis and _italic_ for secondary emphasis
- Use \`code\` for inline code and \`\`\` for code blocks (with language specified)
- Use > for blockquotes
- Use - or * for unordered lists and 1. 2. for ordered lists
- Use [text](url) for links
- Use tables when presenting structured data
`;
}

/**
 * Check if a string contains markdown formatting
 * @param {string} text - The text to check
 * @returns {boolean} - True if the text contains markdown formatting
 */
function containsMarkdown(text) {
    if (!text) return false;

    // Common markdown patterns
    const markdownPatterns = [
        /^#+\s/m,                      // Headers
        /\*\*[\s\S]+?\*\*/,            // Bold
        /\*[\s\S]+?\*/,                // Italic
        /`[\s\S]+?`/,                  // Inline code
        /```[\s\S]+?```/,              // Code blocks
        /^\s*>\s/m,                    // Blockquotes
        /^\s*[-*+]\s/m,                // Unordered lists
        /^\s*\d+\.\s/m,                // Ordered lists
        /\[[\s\S]+?\]\([\s\S]+?\)/,    // Links
        /!\[[\s\S]*?\]\([\s\S]+?\)/,   // Images
        /^\s*---\s*$/m,                // Horizontal rules
        /\|[\s\S]+?\|/                 // Tables
    ];

    // Check if any pattern matches
    return markdownPatterns.some(pattern => pattern.test(text));
}

export default {
    serializeMarkdown,
    deserializeMarkdown,
    markdownToHtml,
    htmlToMarkdown,
    getMarkdownInstructionPrompt,
    containsMarkdown
}; 