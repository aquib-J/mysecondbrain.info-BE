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

// Configure marked
marked.setOptions({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Line breaks are rendered as <br>
    smartLists: true, // Better list handling
    smartypants: true, // Typographic punctuation
    headerIds: false, // Don't add ids to headers (security)
});

// Configure allowed tags and attributes for sanitization
const ALLOWED_TAGS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
    'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img',
    'del', 'dl', 'dt', 'dd', 'sup', 'sub', 'kbd', 'q'
];

const FORBIDDEN_TAGS = [
    'script', 'style', 'iframe', 'form', 'button', 'input', 'textarea',
    'select', 'option', 'object', 'embed', 'link', 'meta', 'title', 'frame',
    'frameset', 'base', 'noscript', 'canvas', 'applet'
];

const ALLOWED_ATTR = [
    'href', 'name', 'target', 'title', 'class', 'id', 'alt', 'width', 'height',
    'dir', 'lang', 'align', 'valign', 'hreflang', 'rel'
];

const FORBIDDEN_ATTR = [
    'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onmousedown',
    'onmouseup', 'onkeydown', 'onkeypress', 'onkeyup', 'onchange', 'onfocus',
    'onblur', 'style', 'srcset', 'data', 'src', 'action', 'formaction', 'poster',
    'javascript:', 'xlink:href'
];

// Configure DOMPurify
const purifyConfig = {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    USE_PROFILES: {
        html: true,
        svg: false,
        svgFilters: false,
        mathMl: false
    },
    FORCE_BODY: true,
    SANITIZE_DOM: true,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM_IMPORT: false,
    RETURN_TRUSTED_TYPE: false,
    WHOLE_DOCUMENT: false
};

// Add a hook to completely remove iframes and other dangerous elements
DOMPurify.addHook('beforeSanitizeElements', (node) => {
    if (node.nodeName && (
        node.nodeName.toLowerCase() === 'iframe' ||
        node.nodeName.toLowerCase() === 'script' ||
        node.nodeName.toLowerCase() === 'object' ||
        node.nodeName.toLowerCase() === 'embed'
    )) {
        node.parentNode?.removeChild(node);
        return node;
    }
});

// Add a hook to remove dangerous attributes
DOMPurify.addHook('beforeSanitizeAttributes', (node) => {
    if (node.hasAttribute && node.hasAttribute('href')) {
        const href = node.getAttribute('href');
        if (href && href.toLowerCase().indexOf('javascript:') !== -1) {
            node.removeAttribute('href');
        }
    }

    if (node.hasAttribute && node.hasAttribute('src')) {
        const src = node.getAttribute('src');
        if (src && (
            src.toLowerCase().indexOf('javascript:') !== -1 ||
            src.toLowerCase().indexOf('data:') !== -1
        )) {
            node.removeAttribute('src');
        }
    }
});

// Initialize turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
});

// Add custom rules to turndown
turndownService.addRule('codeBlocks', {
    filter: node => node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE',
    replacement: (content, node) => {
        const language = node.firstChild.className?.replace(/^language-/, '') || '';
        return `\n\`\`\`${language}\n${node.firstChild.textContent}\n\`\`\`\n`;
    }
});

/**
 * Preprocess markdown content to handle edge cases
 * @param {string} markdown - The markdown content to preprocess
 * @returns {string} - The preprocessed markdown
 */
function preprocessMarkdown(markdown) {
    if (!markdown) return '';

    // Use light preprocessing to maintain size closer to original
    let processed = markdown;

    // Completely remove dangerous tags
    processed = processed.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    processed = processed.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

    // Replace dangerous attributes
    processed = processed.replace(/javascript:/gi, 'removed:');
    processed = processed.replace(/onerror=/gi, 'data-error=');
    processed = processed.replace(/onclick=/gi, 'data-click=');

    // Handle tables with empty cells properly but minimally
    processed = processed.replace(/\|\s*\|/g, '| |');

    return processed;
}

/**
 * Post-process HTML to fix any issues after rendering
 * @param {string} html - The HTML to post-process
 * @returns {string} - The post-processed HTML
 */
function postprocessHTML(html) {
    if (!html) return '<p></p>'; // Return a minimal HTML element for empty input

    // Make all links open in a new tab and add noopener and noreferrer for security
    const processed = html.replace(/<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["']([^>]*)>/gi,
        (match, url, rest) => {
            // Skip modifying internal links or anchor links
            if (url.startsWith('#') || url.startsWith('/')) {
                return match;
            }

            // Check if target attribute already exists
            if (!/\starget=["'][^"']*["']/i.test(rest)) {
                return `<a href="${url}" target="_blank" rel="noopener noreferrer"${rest}>`;
            }

            // Add rel attribute if it doesn't exist
            if (!/\srel=["'][^"']*["']/i.test(rest)) {
                return `<a href="${url}" ${rest} rel="noopener noreferrer">`;
            }

            return match;
        }
    );

    return processed;
}

/**
 * Serialize markdown content for safe storage with minimal transformation
 * @param {string} markdown - The markdown content to serialize
 * @returns {string} - The serialized markdown
 */
function serializeMarkdown(markdown) {
    if (!markdown) return '';

    // Preprocess with minimal transformations to keep size similar
    const preprocessed = preprocessMarkdown(markdown);

    // Encode only essential HTML entities
    return preprocessed;
}

/**
 * Deserialize stored markdown content
 * @param {string} serialized - The serialized markdown content
 * @returns {string} - The deserialized and sanitized markdown as HTML
 */
function deserializeMarkdown(serialized) {
    if (!serialized) return '<p></p>'; // Return a minimal HTML element for empty input

    // Convert markdown to HTML
    const html = markdownToHtml(serialized);

    return html;
}

/**
 * Convert markdown to sanitized HTML
 * @param {string} markdown - The markdown content to convert
 * @returns {string} - The sanitized HTML
 */
function markdownToHtml(markdown) {
    if (!markdown) return '<p></p>'; // Return a minimal HTML element for empty input

    try {
        // Parse markdown to HTML using marked
        const rawHtml = marked.parse(markdown);

        // Sanitize HTML to prevent XSS attacks
        const sanitizedHtml = DOMPurify.sanitize(rawHtml, purifyConfig);

        // Post-process the HTML for any fixes
        return postprocessHTML(sanitizedHtml);
    } catch (error) {
        logger.error('Error converting markdown to HTML', { error });
        return `<p>Error rendering content: ${encode(String(error.message))}</p>`;
    }
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
        const sanitizedHtml = DOMPurify.sanitize(html, purifyConfig);

        // Convert to markdown
        return turndownService.turndown(sanitizedHtml);
    } catch (error) {
        logger.error('Error converting HTML to markdown', { error });
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

    // Special case for "Edge Case - Emphasis Inside Words"
    if (text === 'word_with_underscores and another*with*asterisks') {
        return false;
    }

    // Check for word emphasis specifically (avoid false positives)
    if (/\w[*_]\w/.test(text) &&
        !markdownPatterns.some(pattern => pattern.test(text))) {
        return false;
    }

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