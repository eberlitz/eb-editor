import "./style.scss";
import '@convergencelabs/monaco-collab-ext/css/monaco-collab-ext.min.css';
import * as Peer from 'peerjs';
import { EditorContentManager, RemoteCursorManager, RemoteSelectionManager } from "@convergencelabs/monaco-collab-ext";
import { ColorAssigner } from "@convergence/color-assigner";
import { RemoteCursor } from "@convergencelabs/monaco-collab-ext/typings/RemoteCursor";
import { RemoteSelection } from "@convergencelabs/monaco-collab-ext/typings/RemoteSelection";
import { createEditor } from "./monaco";
import { getLocationHash, updateLocationHash } from './helpers';
import { OperationType } from "./operation";
import { Broadcast } from "./broadcast";

const editor = createEditor()

var { id: targetID } = getLocationHash();
const peer = new (Peer as any).default({
    host: location.hostname,
    port: location.port as any || (location.protocol === 'https:' ? 443 : 80),
    path: '/peerjs',
    config: {
        // 'iceServers':
        //     [
        //         { url: 'stun:stun1.l.google.com:19302' },
        //         {
        //             url: 'turn:numb.viagenie.ca',
        //             credential: 'credential',
        //             username: 'username'
        //         }
        //     ]
    },
    debug: 1
}) as Peer;

const broadcast = new Broadcast(targetID, peer);
broadcast.getData = () => editor.getModel().getLinesContent().join('\n');
broadcast.setData = (value) => editor.getModel().setValue(value);
broadcast.onInsertText = (index: number, value: string) => contentManager.insert(index, value);
broadcast.onDeleteText = (index: number, length: number) => contentManager.delete(index, length);

const remoteCursorManager = new RemoteCursorManager({
    editor: editor as any,
    tooltips: true,
    tooltipDuration: 2
});
const _remoteSelectionManager = new RemoteSelectionManager({ editor: editor as any });
const remoteSelections = new Map<string, RemoteSelection>();
const remoteCursors = new Map<string, RemoteCursor>();
const _colorAssigner = new ColorAssigner();

const contentManager = new EditorContentManager({
    editor: editor as any,
    onInsert(index: any, text: any) {
        broadcast.broadcast({
            type: OperationType.INSERT_TEXT,
            index,
            text
        });
    },
    onReplace(index: any, length: any, text: any) {
        broadcast.broadcast([{
            type: OperationType.DELETE_TEXT,
            index,
            length
        }, {
            type: OperationType.INSERT_TEXT,
            index,
            text
        }])
    },
    onDelete(index: any, length: any) {
        broadcast.broadcast({
            type: OperationType.DELETE_TEXT,
            index,
            length
        })
    }
});




editor.onDidChangeCursorPosition(e => {
    // setLocalCursor
    const position = editor.getPosition();
    const offset = editor.getModel().getOffsetAt(position);
    broadcast.broadcast({
        type: OperationType.UPDATE_CURSOR_OFFSET,
        offset,
        peer: peer.id
    })
});


broadcast.onUpdateCursor = (peerId, offset) => {
    // ignore local cursor
    if (peer.id === peerId) {
        return;
    }

    let remoteCursor = remoteCursors.get(peerId);
    if (!remoteCursor && offset !== null) {
        const color = _colorAssigner.getColorAsHex(peerId);
        remoteCursor = remoteCursorManager.addCursor(peerId, color, peerId);
        remoteCursors.set(peerId, remoteCursor);
    }
    if (offset !== null) {
        remoteCursor.setOffset(offset);
    } else if (!!remoteCursor) {
        remoteCursor.hide();
    }
}
function removeRemoteCursor(peerId: string) {
    let remoteCursor = remoteCursors.get(peerId);
    if (remoteCursor) {
        remoteCursors.delete(peerId);
        remoteCursor.dispose();
    }
}


broadcast.onPeerDisconnected = (peerId: string) => {
    console.log(`Peer disconnected!`, peerId);
    removeRemoteSelection(peerId);
    removeRemoteCursor(peerId);
    const id = broadcast.getValidTargetId();
    updateLocationHash({ id });
};



function sendSelection(value: { start: number, end: number } | null) {
    broadcast.broadcast({
        type: OperationType.UPDATE_SELECTION,
        peer: peer.id,
        value: value
    });
}


let lastSelection: any = undefined;
editor.onDidChangeCursorSelection(e => {
    // setLocalSelection
    const selection = editor.getSelection();
    if (!selection.isEmpty()) {
        const editorModel = editor.getModel();
        const start = editorModel.getOffsetAt(selection.getStartPosition());
        const end = editorModel.getOffsetAt(selection.getEndPosition());
        lastSelection = { start, end };
        sendSelection(lastSelection);

    } else if (!!lastSelection) {
        // this._selectionReference.clear();
        lastSelection = null;
        sendSelection(lastSelection);
    }
});


broadcast.onUpdateSelection = (peerId, value) => {
    // ignore local cursor
    if (peer.id === peerId) {
        return;
    }

    let remoteSelection = remoteSelections.get(peerId);
    if (!remoteSelection && value !== null) {
        const color = _colorAssigner.getColorAsHex(peerId);
        remoteSelection = _remoteSelectionManager.addSelection(peerId, color);
        remoteSelections.set(peerId, remoteSelection);
    }
    if (value !== null) {
        remoteSelection.setOffsets(value.start, value.end);
    } else if (!!remoteSelection) {
        remoteSelection.hide();
    }
}

function removeRemoteSelection(peerId: string) {
    let remoteSelection = remoteSelections.get(peerId);
    if (remoteSelection) {
        remoteSelections.delete(peerId);
        remoteSelection.dispose();
    }
}