import "./style.scss";
import '@convergencelabs/monaco-collab-ext/css/monaco-collab-ext.min.css';
import * as Peer from 'peerjs';
import { v1 as UUID } from "uuid";
import { EditorContentManager, RemoteCursorManager, RemoteSelectionManager } from "@convergencelabs/monaco-collab-ext";
import { ColorAssigner } from "@convergence/color-assigner";
import { RemoteCursor } from "@convergencelabs/monaco-collab-ext/typings/RemoteCursor";
import { RemoteSelection } from "@convergencelabs/monaco-collab-ext/typings/RemoteSelection";
import { createEditor } from "./monaco";
import { getLocationHash, updateLocationHash } from './helpers';

const editor = createEditor()

const enum OperationType {
    ADD_TO_NETWORK,
    LOAD,
    DATA,
    DELETE_TEXT,
    INSERT_TEXT,
    UPDATE_CURSOR_OFFSET,
    UPDATE_SELECTION
}

export interface LoadOperation {
    type: OperationType.LOAD;
}

export interface DataOperation {
    type: OperationType.DATA;
    data: any;
    net: string[];
}

export interface RelayableOperation {
    uuid: string;
}

export interface AddToNetworkOperation {
    type: OperationType.ADD_TO_NETWORK;
    peer: string;
}

export interface InsertTextOperation {
    type: OperationType.INSERT_TEXT;
    index: number;
    text: string;
}

export interface DeleteTextOperation {
    type: OperationType.DELETE_TEXT;
    index: number;
    length: number;
}

export interface UpdateCursorOperation {
    type: OperationType.UPDATE_CURSOR_OFFSET;
    peer: string;
    offset: number;
}

export interface UpdateSelectionOperation {
    type: OperationType.UPDATE_SELECTION;
    peer: string;
    value?: { start: number, end: number };
}

export interface MaybeRelayableOperation {
    uuid?: string;
}

export type Operation = MaybeRelayableOperation & (LoadOperation | DataOperation
    | AddToNetworkOperation | InsertTextOperation | DeleteTextOperation
    | UpdateCursorOperation | UpdateSelectionOperation);

function getRelayOpUUID(op: Operation | Operation[]): string | undefined {
    const ops = Array.isArray(op) ? op : [op];
    const opWithUuid = ops.find((a) => !!a.uuid);
    return opWithUuid && opWithUuid.uuid;
}

function isRelayOp(op: Operation | Operation[]) {
    return !!getRelayOpUUID(op);
}

export class Broadcast {
    onInsertText?: (index: number, value: string) => void;
    onDeleteText?: (index: number, length: number) => void;
    onUpdateCursor?: (peer: string, offset: number) => void;
    onUpdateSelection?: (peer: string, value: { start: number, end: number } | undefined) => void;
    setData: (data: any) => void;
    getData: () => any;
    MAX_APPLIEDOPS_BUFFER_SIZE = 100;
    private siteID = UUID();
    private opcounter = 0;
    private appliedOps: string[] = [];
    private network: Peer.DataConnection[] = [];
    constructor(
        private targetID: string,
        private peer: Peer,
        private data: any
    ) {
        this.onOpen();
    }

    getOperationID() {
        return `${this.siteID}-${this.opcounter++}`
    }

    private onOpen() {
        this.peer.on('open', (id) => {
            console.info('Peer ID: ' + id);
            this.onPeerConnection();
            if (!this.targetID) {
                updateLocationHash({ id });
            } else {
                this.connectToTarget(this.targetID);
            }
        });
    }

    /**
     *  Connect to a target, and requests for the initial data;
     *
     * @param {string} targetPeerId
     * @memberof Broadcast
     */
    private connectToTarget(targetPeerId: string, loadInitialData = true) {
        // console.log(`connecting to ${targetPeerId} ...`);
        const conn = peer.connect(targetPeerId);
        conn.on('open', () => {
            console.log(`==> connected to ${targetPeerId}`);
            this.addToNetwork(conn, false);
            if (loadInitialData) {
                conn.send({ type: OperationType.LOAD });
            }
            this.onData(conn);
            this.onConnClose(conn);
        });
    }

    private onPeerConnection() {
        peer.on('connection', (conn) => {
            console.log(`<== receive connection from ${conn.peer}`);
            this.addToNetwork(conn, true);
            conn.on('open', () => {
                this.onData(conn);
                this.onConnClose(conn);
            });
        });
    }

    broadcast(op: Operation | Operation[]) {
        // Just mark operations as applied to save bandwidth
        this.applyOpsOnce(op, () => { });

        this.network.forEach(c => c.send(op));
    }

    private addToNetwork(conn: Peer.DataConnection, broadcast: boolean) {
        if (!!conn && !this.network.find(a => a.peer === conn.peer)) {
            this.network.push(conn);
            if (broadcast) {
                console.log(`broadcasting ADD_TO_NETWORK:[${peer}]`)
                this.broadcast({
                    type: OperationType.ADD_TO_NETWORK,
                    peer: conn.peer,
                });
            }
            this.logInfo();
        }
    }

    private removeConnection(conn: Peer.DataConnection) {
        let idx = this.network.indexOf(conn);
        if (idx !== -1) {
            this.network.splice(idx, 1);
        }
        this.logInfo();
    }

    private onData(conn: Peer.DataConnection) {
        // Receive messages
        conn.on('data', (d: Operation | Operation[]) => {
            this.applyOpsOnce(d, () => {
                isRelayOp(d) && this.broadcast(d);
                // Relay data to peers
                // console.log(`Received from ${conn.peer}`, JSON.stringify(d, null, 4));
                var ops = Array.isArray(d) ? d : [d];

                ops.forEach(data => {
                    switch (data.type) {
                        case OperationType.LOAD:
                            conn.send({
                                type: OperationType.DATA,
                                data: this.getData(),
                                net: this.network.map(a => a.peer)
                            } as DataOperation);
                            break;
                        case OperationType.DATA:
                            this.setData(data.data);
                            data.net.filter(a => a !== this.peer.id)
                                .forEach(p => this.connectToTarget(p, false));
                            break;
                        case OperationType.ADD_TO_NETWORK:
                            data.peer !== this.peer.id
                                && !this.network.find(a => a.peer == data.peer)
                                && this.connectToTarget(data.peer, false);
                            break;
                        case OperationType.INSERT_TEXT:
                            this.onInsertText && this.onInsertText(data.index, data.text);
                            break;
                        case OperationType.DELETE_TEXT:
                            this.onDeleteText && this.onDeleteText(data.index, data.length)
                            break;
                        case OperationType.UPDATE_CURSOR_OFFSET:
                            this.onUpdateCursor && this.onUpdateCursor(data.peer, data.offset)
                            break;
                        case OperationType.UPDATE_SELECTION:
                            this.onUpdateSelection && this.onUpdateSelection(data.peer, data.value)
                            break;
                        default:
                            console.warn(`Unknow operation received from ${conn.peer}`, data);
                            break;
                    }
                });
            });
        });
    }



    private applyOpsOnce(op: Operation | Operation[], applyFn: () => void) {
        const opUUID = getRelayOpUUID(op);
        if (!opUUID) {
            return applyFn();
        }
        if (this.appliedOps.indexOf(opUUID) !== -1) {
            return;
        }
        if (this.appliedOps.length === this.MAX_APPLIEDOPS_BUFFER_SIZE) {
            this.appliedOps.shift();
        }
        this.appliedOps.push(opUUID);
        applyFn();
    }


    private onConnClose(conn: Peer.DataConnection) {
        conn.on('close', () => {
            this.removeConnection(conn);
            if (conn.peer === this.targetID) {
                const candidate = this.network[0];
                const id = candidate && candidate.peer || this.peer.id;
                updateLocationHash({ id })
            }
        });
    }
    private logInfo() {
        console.log(`network:[${this.network.map(a => a.peer)}]`);
    }
}

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
let data = !targetID ? {
    text: "",
    cursors: {},
    selections: {}
} : {};

function updateDataText() {
    return Object.assign(data, {
        text: editor.getModel().getLinesContent().join('\n')
    });
}

const broadcast = new Broadcast(targetID, peer, data);
broadcast.getData = () => updateDataText();
broadcast.setData = (d) => {
    data = Object.assign(data || {}, d);
    editor.getModel().setValue(data.text);
    // updateLocationHash({ id: peer.id })
};
broadcast.onInsertText = (index: number, value: string) => contentManager.insert(index, value);
broadcast.onDeleteText = (index: number, length: number) => contentManager.delete(index, length);



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


const remoteCursorManager = new RemoteCursorManager({
    editor: editor as any,
    tooltips: true,
    tooltipDuration: 2
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

const remoteCursors = new Map<string, RemoteCursor>();
const _colorAssigner = new ColorAssigner();
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
        remoteCursors.delete(peerId);
        remoteCursor.dispose();
    }
}





let lastSelection: any = undefined;
editor.onDidChangeCursorSelection(e => {
    // setLocalSelection
    const selection = editor.getSelection();
    if (!selection.isEmpty()) {
        const start = editor.getModel().getOffsetAt(selection.getStartPosition());
        const end = editor.getModel().getOffsetAt(selection.getEndPosition());
        // this._selectionReference.set({ start, end });

        lastSelection = {
            uuid: broadcast.getOperationID(),
            type: OperationType.UPDATE_SELECTION,
            peer: peer.id,
            value: { start, end }
        };
        broadcast.broadcast(lastSelection);

    } else if (!!lastSelection && !!lastSelection.value) {
        // this._selectionReference.clear();
        lastSelection = {
            uuid: broadcast.getOperationID(),
            type: OperationType.UPDATE_SELECTION,
            peer: peer.id,
            value: null
        };
        broadcast.broadcast(lastSelection);
    }
});

const _remoteSelectionManager = new RemoteSelectionManager({ editor: editor as any });
const remoteSelections = new Map<string, RemoteSelection>();
// TODO: Dispose and remove from map when the peer close connection.
// remoteSelections.delete(peerId);
// remoteSelection.dispose();
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