import * as Peer from 'peerjs';
import { updateLocationHash } from './helpers';
import { OperationType, Operation, isRelayOp, DataOperation, getRelayOpUUID } from "./operation";
import { v1 as UUID } from "uuid";

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
    onPeerDisconnected: (peerId: string) => void;
    constructor(
        private targetID: string,
        private peer: Peer
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
        // Just mark operations as applied to save bandwidth
        this.applyOpsOnce(op, () => { });

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
