import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

export default function RichTextEditor({ value, onChange }) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: value ?? "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 4, padding: 6, borderBottom: "1px solid var(--border)" }}>
        <button type="button" className="secondary" style={{ padding: "4px 8px" }} onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
        <button type="button" className="secondary" style={{ padding: "4px 8px", fontStyle: "italic" }} onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
        <button type="button" className="secondary" style={{ padding: "4px 8px", textDecoration: "underline" }} onClick={() => editor.chain().focus().toggleUnderline().run()}>U</button>
        <button type="button" className="secondary" style={{ padding: "4px 8px" }} onClick={() => editor.chain().focus().toggleBulletList().run()}>&bull; List</button>
        <button type="button" className="secondary" style={{ padding: "4px 8px" }} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
      </div>
      <EditorContent editor={editor} style={{ padding: 10, minHeight: 80 }} />
    </div>
  );
}
