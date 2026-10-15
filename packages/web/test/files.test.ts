import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { workspaceFiles, workspaceFromFiles } from '../src/folder.ts';
import { readZip, writeZip } from '../src/zip.ts';

const dir = new URL('../../../examples/aws-pagos/', import.meta.url);
const read = (f: string) => readFileSync(new URL(f, dir), 'utf8');
const sources = { model: read('architecture.calm.yaml'), views: { 'infra-aws': read('views/infra-aws.view.yaml'), 'contenedores-c4': read('views/contenedores-c4.view.yaml') } };

describe('saving a workspace as files', () => {
  it('round-trips through a .zip in the folder layout', async () => {
    const files = workspaceFiles(sources);
    expect(files.map((f) => f.path)).toEqual(['architecture.calm.yaml', 'views/contenedores-c4.view.yaml', 'views/infra-aws.view.yaml']);
    const zip = writeZip(files);
    const back = workspaceFromFiles(await readZip(zip.buffer as ArrayBuffer), 'x');
    expect(back.sources).toEqual(sources);
  });

  it('opens a zip of a folder, naming the workspace after it', () => {
    const opened = workspaceFromFiles(
      [
        { path: 'pagos/architecture.calm.yaml', text: 'nodes: []' },
        { path: 'pagos/views/a.view.yaml', text: 'title: A' },
      ],
      'fallback',
    );
    expect(opened.name).toBe('pagos');
    expect(Object.keys(opened.sources.views)).toEqual(['a']);
  });

  it('reads deflated entries written by other tools', async () => {
    // A one-file archive made with `zip -9`: hello.txt = "hola hola hola hola".
    const b64 = 'UEsDBBQAAgAIADqcRV25qDPbCQAAABMAAAAJAAAAaGVsbG8udHh0y8jPSVTIQCEAUEsBAh4DFAACAAgAOpxFXbmoM9sJAAAAEwAAAAkAAAAAAAAAAQAAAKSBAAAAAGhlbGxvLnR4dFBLBQYAAAAAAQABADcAAAAwAAAAAAA=';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(await readZip(bytes.buffer)).toEqual([{ path: 'hello.txt', text: 'hola hola hola hola' }]);
  });
});
