import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline font-medium" />
          ),
          h1: ({ node, ...props }) => <h1 {...props} className="text-lg font-bold mt-4 mb-2 text-slate-900 dark:text-white" />,
          h2: ({ node, ...props }) => <h2 {...props} className="text-md font-bold mt-3 mb-2 text-slate-800 dark:text-slate-100" />,
          h3: ({ node, ...props }) => <h3 {...props} className="text-sm font-bold mt-2 mb-1 text-slate-800 dark:text-slate-100" />,
          ul: ({ node, ...props }) => <ul {...props} className="list-disc list-inside space-y-1 mb-2" />,
          ol: ({ node, ...props }) => <ol {...props} className="list-decimal list-inside space-y-1 mb-2" />,
          li: ({ node, ...props }) => <li {...props} className="leading-relaxed" />,
          p: ({ node, ...props }) => <p {...props} className="mb-2 leading-relaxed" />,
          strong: ({ node, ...props }) => <strong {...props} className="font-bold text-slate-900 dark:text-white" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
