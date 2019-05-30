import * as Peer from 'peerjs';
import { OperationType, Operation, DataOperation } from "./operation";

export class Broadcast {
    onInsertText?: (index: number, value: string) => void;
    onDeleteText?: (index: number, length: number) => void;
    onUpdateCursor?: (peer: string, offset: number) => void;
    onUpdateSelection?: (peer: string, value: { start: number, end: number } | undefined) => void;
    setData: (data: any) => void;
    getData: () => any;
    onPeerDisconnected: (peerId: string) => void;
    onOpen: (id: string) => void;
    private network: Peer.DataConnection[] = [];
    constructor(
        private peer: Peer
    ) {
        this._onOpen();
    }

    private _onOpen() {
        this.peer.on('open', (id) => {
            console.info('Peer ID: ' + id);
            this.onPeerConnection();
            this.onOpen(id);
        });
    }

    /**
     *  Connect to a target, and requests for the initial data;
     *
     * @param {string} targetPeerId
     * @memberof Broadcast
     */
    connectToTarget(targetPeerId: string, loadInitialData = true) {
        // console.log(`connecting to ${targetPeerId} ...`);
        const conn = this.peer.connect(targetPeerId);
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
        this.peer.on('connection', (conn) => {
            console.log(`<== receive connection from ${conn.peer}`);
            this.addToNetwork(conn, true);
            conn.on('open', () => {
                this.onData(conn);
                this.onConnClose(conn);
            });
        });
    }

    broadcast(op: Operation | Operation[]) {
        this.network.forEach(c => c.send(op));
    }

    private addToNetwork(conn: Peer.DataConnection, broadcast: boolean) {
        if (!!conn && !this.network.find(a => a.peer === conn.peer)) {
            this.network.push(conn);
            if (broadcast) {
                console.log(`broadcasting ADD_TO_NETWORK:[${conn.peer}]`)
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
    }

    private onConnClose(conn: Peer.DataConnection) {
        conn.on('close', () => {
            this.removeConnection(conn);
            this.onPeerDisconnected && this.onPeerDisconnected(conn.peer);
        });
    }
    getValidTargetId() {
        const conn = this.network.find(a => a.peer !== this.peer.id);
        if (conn) {
            return conn.peer;
        }
        return this.peer.id;
    }
    private logInfo() {
        console.log(`network:[${this.network.map(a => a.peer)}]`);
    }
}
