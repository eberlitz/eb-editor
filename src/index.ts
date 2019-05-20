import { Broadcast } from './broadcast';
import "./style.scss";
import * as monaco from 'monaco-editor';
import Peer from 'peerjs';

import { v1 as UUID } from "uuid";


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

const editor = monaco.editor.create(document.getElementById('container'), {
    // theme: "vs-dark'",
    value: `
# Hello world

Loren ipsum
`,
    language: 'markdown'
});

// editor.getModel().onDidChangeContent((evt) => {
//     console.log(evt);
// });

import '@convergencelabs/monaco-collab-ext/css/monaco-collab-ext.min.css';
// import { 
//     EditorContentManager, 
//     RemoteSelectionManager, 
//     RemoteCursorManager 
// } from '@convergencelabs/monaco-collab-ext';


// const contentManager = new EditorContentManager({
//     editor: editor as any,
//     onInsert(index: any, text: any) {
//         console.log("Insert", index, text);
//     },
//     onReplace(index: any, length: any, text: any) {
//         console.log("Replace", index, length, text);
//     },
//     onDelete(index: any, length: any) {
//         console.log("Delete", index, length);
//     }
// });


// const remoteSelectionManager = new RemoteSelectionManager({ editor: editor as any });

// const selection = remoteSelectionManager.addSelection("jDoe", "blue");

// // Set the range of the selection using zero-based offsets.
// selection.setOffsets(45, 55);

// // Hide the selection
// selection.hide();

// // Show the selection
// selection.show();

// // Remove the selection.
// // selection.dispose();

// // Insert text into the editor at offset 5.
// contentManager.insert(5, "some text");

// // Replace the text in the editor at range 5 - 10.
// contentManager.replace(5, 10, "some text");

// // Delete the text in the editor at range 5 - 10.
// contentManager.delete(5, 10);

// Release resources when done
// contentManager.dispose();


// const remoteCursorManager = new RemoteCursorManager({
//     editor: editor as any,
//     tooltips: true,
//     tooltipDuration: 2
// });

// const cursor = remoteCursorManager.addCursor("jDoe", "blue", "John Doe");

// // Set the position of the cursor.
// cursor.setOffset(4);

// // Hide the cursor
// cursor.hide();

// // Show the cursor
// cursor.show();

// Remove the cursor.
//   cursor.dispose();





const peer = new Peer({
    host: location.hostname,
    port: location.port as any || (location.protocol === 'https:' ? 443 : 80),
    path: '/peerjs',
    config: {
        // 'iceServers':
        //     [
        //         { url: 'stun:stun1.l.google.com:19302' },
        //         {
        //             url: 'turn:numb.viagenie.ca',
        //             credential: 'conclave-rulez',
        //             username: 'sunnysurvies@gmail.com'
        //         }
        //     ]
    },
    debug: 1
})

const targetPeerId = location.search.slice(1);
let localPeerID = undefined;

const siteId = UUID();

const broadcast = new Broadcast(siteId);
broadcast.bindServerEvents(targetPeerId, peer);
broadcast.updateShareLink = (id)=> console.log(`connected as '${id}'`)
