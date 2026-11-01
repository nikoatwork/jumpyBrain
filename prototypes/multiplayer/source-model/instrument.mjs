import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export function sourceEditorInstrumentation(root) {
  return {
    name: 'm1-source-editor-instrumentation',
    setup(build) {
      build.onLoad({ filter: /[/\\]lexical-editor\.ts$/ }, async ({ path: file }) => {
        if (file !== path.join(root, 'src/adapters/http-server/lexical-editor.ts')) return;
        const original = await readFile(file, 'utf8');
        const marker = '  const api = {\n';
        const history = 'registerHistory(editor, history, 300)';
        if (original.split(marker).length !== 2 || original.split(history).length !== 2) throw new Error('Production editor instrumentation anchors changed.');
        const injected = [
          '  const prototypeHooks = {',
          '    keys: () => editor.getEditorState().read(() => $getRoot().getChildren().map((node) => node.getKey())),',
          '    selection: () => editor.getEditorState().read(() => { const selected = $getSelection(); return $isRangeSelection(selected) ? {key: selected.anchor.key, offset: selected.anchor.offset} : null; }),',
          '    focusAt(needle, offset) { editor.update(() => { const node = $getRoot().getAllTextNodes().find((node) => node.getTextContent().includes(needle)); if (!node) throw new Error("missing visible needle"); node.select(offset, offset); }, {discrete:true}); },',
          '    sourcePatch(patch) {',
          '      if (editor.isComposing()) return {status:"recovery",reason:"composition_active"};',
          '      if (patch.before !== markdown) return {status:"recovery",reason:"client_base_changed"};',
          '      if (!Number.isInteger(patch.start) || !Number.isInteger(patch.deleteCount) || patch.start < 0 || patch.deleteCount < 0 || patch.start + patch.deleteCount > markdown.length || typeof patch.insert !== "string") return {status:"recovery",reason:"invalid_patch"};',
          '      if (patch.insert.includes("\\n") || markdown.slice(patch.start,patch.start+patch.deleteCount).includes("\\n")) return {status:"recovery",reason:"structural_patch_requires_binding"};',
          '      const expected = markdown.slice(0,patch.start)+patch.insert+markdown.slice(patch.start+patch.deleteCount);',
          '      const previousState = editor.getEditorState(), previousSources = new Map([...sources].map(([key,value]) => [key,{...value}]));',
          '      let outcome = {status:"recovery",reason:"source_range_not_visible"};',
          '      loading = true;',
          '      try { editor.update(() => {',
          '        const nodes = $getRoot().getChildren();',
          '        if (nodes.some((node) => sources.get(node.getKey())?.snapshot !== snapshot(node))) {',
          '          const parsed = parseMarkdown(markdown);',
          '          if (parsed.length !== nodes.length || parsed.some((node,index) => node.getType() !== nodes[index].getType())) { parsed.forEach((node) => sources.delete(node.getKey())); outcome = {status:"recovery",reason:"structural_client_draft"}; return; }',
          '          parsed.forEach((node,index) => { const source = sources.get(node.getKey())!; sources.set(nodes[index].getKey(),{original:source.original,snapshot:snapshot(nodes[index])}); sources.delete(node.getKey()); });',
          '        }',
          '        let blockStart = 0;',
          '        for (const block of nodes) {',
          '          const source = sources.get(block.getKey())!;',
          '          const sourceStart = patch.start-blockStart;',
          '          if (sourceStart >= 0 && sourceStart+patch.deleteCount <= source.original.length && $isElementNode(block)) {',
          '            if (source.original.length === 0 && patch.start === blockStart && patch.deleteCount === 0 && block.getAllTextNodes().length === 0) {',
          '              block.append($createTextNode(patch.insert)); sources.set(block.getKey(),{original:patch.insert,snapshot:snapshot(block)}); outcome={status:"applied",reason:"empty_paragraph_leaf"}; return;',
          '            }',
          '            let cursor = 0;',
          '            for (const leaf of block.getAllTextNodes()) {',
          '              const text = leaf.getTextContent(); if (!text.length) continue;',
          '              const start = source.original.indexOf(text,cursor); if (start < 0) continue;',
          '              const end = start+text.length; cursor=end;',
          '              if (sourceStart < start || sourceStart+patch.deleteCount > end) continue;',
          '              if (source.original.indexOf(text,start+1) >= 0) { outcome={status:"recovery",reason:"ambiguous_visible_mapping"}; return; }',
          '              leaf.spliceText(sourceStart-start,patch.deleteCount,patch.insert);',
          '              sources.set(block.getKey(),{original:source.original.slice(0,sourceStart)+patch.insert+source.original.slice(sourceStart+patch.deleteCount),snapshot:snapshot(block)});',
          '              outcome={status:"applied",reason:"granular_leaf_splice"}; return;',
          '            }',
          '          }',
          '          blockStart += source.original.length+1;',
          '        }',
          '      }, {discrete:true,tag:HISTORIC_TAG});',
          '      } finally { loading = false; }',
          '      if (outcome.status === "applied") {',
          '        const actual = editor.getEditorState().read(() => serialize()); markdown=actual;',
          '        if (actual !== expected || patch.__injectSerializationFailure === true) {',
          '          loading = true;',
          '          try { sources.clear(); previousSources.forEach((value,key) => sources.set(key,value)); editor.setEditorState(previousState,{tag:HISTORIC_TAG}); markdown=patch.before; } finally { loading=false; }',
          '          return {status:"recovery",reason:"serialization_mismatch",actual,expected,markdown,injected:patch.__injectSerializationFailure === true};',
          '        }',
          '        notifyReferenceContext();',
          '      }',
          '      return {...outcome,markdown};',
          '    },',
          '  };',
          marker + '    __m1: prototypeHooks,',
        ].join('\n');
        return { contents: original.replace(history, '(() => {})').replace(marker, injected), loader: 'ts',
          watchFiles: [file] };
      });
    },
  };
}
export async function editorSourceHash(root) {
  return createHash('sha256').update(await readFile(path.join(root, 'src/adapters/http-server/lexical-editor.ts'))).digest('hex');
}
