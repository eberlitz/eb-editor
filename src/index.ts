import "./style.scss";
import * as monaco from 'monaco-editor';

(self as any).MonacoEnvironment = {
    getWorkerUrl: (moduleId: string, label: string) => {
        if (label === 'json') {
            return './json.worker.bundle.js';
        }
        if (label === 'css') {
            return './css.worker.bundle.js';
        }
        if (label === 'html') {
            return './html.worker.bundle.js';
        }
        if (label === 'typescript' || label === 'javascript') {
            return './ts.worker.bundle.js';
        }
        return './editor.worker.bundle.js';
    }
}

monaco.editor.create(document.getElementById('container'), {
    value: [
        'function x() {',
        '\tconsole.log("Hello world!");',
        '}'
    ].join('\n'),
    language: 'javascript'
});