import * as Peer from 'peerjs';


export type IPeer = any;
export type IPeerConnection = any;

const enum OperationType {
    ADD_TO_NETWORK = "ADD_TO_NETWORK",
    REMOVE_FROM_NETWORK = "REMOVE_FROM_NETWORK"
}

export interface AddToNetworkOperation {
    type: OperationType.ADD_TO_NETWORK;
    newPeer: string;
    newSite: string;
}

export interface RemoveFromNetworkOperation {
    type: OperationType.REMOVE_FROM_NETWORK;
    oldPeer: string;
}

export type Operation = AddToNetworkOperation | RemoveFromNetworkOperation;

export class Broadcast {
    private peer: IPeer;
    heartbeat: { start: () => void; stop: () => void; };
    inConns: IPeerConnection[] = [];
    outConns: IPeerConnection[] = [];
    urlId: any;
    private MAX_BUFFER_SIZE = 40;
    private outgoingBuffer: string[] = [];
    constructor(
        private siteId: string
    ) { }

    send(operation: Operation) {
        const operationJSON = JSON.stringify(operation);
        if (operation.type === 'insert' || operation.type === 'delete') {
            this.addToOutgoingBuffer(operationJSON);
        }
        this.outConns.forEach(conn => conn.send(operationJSON));
    }

    addToOutgoingBuffer(operation: string) {
        if (this.outgoingBuffer.length === this.MAX_BUFFER_SIZE) {
            this.outgoingBuffer.shift();
        }

        this.outgoingBuffer.push(operation);
    }

    processOutgoingBuffer(peerId: string) {
        const connection = this.outConns.find(conn => conn.peer === peerId);
        this.outgoingBuffer.forEach(op => {
            connection.send(op);
        });
    }

    bindServerEvents(targetPeerId: string, peer: IPeer) {
        this.peer = peer;
        this.onOpen(targetPeerId);
    }

    onOpen(targetPeerId: string | undefined) {
        this.peer.on('open', (id: string) => {
            this.updateShareLink && this.updateShareLink(id)
            this.onPeerConnection();
            this.onError();
            this.onDisconnect();
            if (!targetPeerId) {
                this.addToNetwork(id, this.siteId);
            } else {
                this.requestConnection(targetPeerId, id, this.siteId)
            }
        });
    }
    updateShareLink?: (id: any) => void;

    onError() {
        this.peer.on("error", err => {
            const pid = String(err).replace("Error: Could not connect to peer ", "");
            this.removeFromConnections(pid);
            console.log(err.type);
            if (!this.peer.disconnected) {
                this.findNewTarget();
            }
            this.enableEditor();
        });
    }


    onDisconnect() {
        this.peer.on('disconnected', () => {
            this.lostConnection();
        });
    }



    requestConnection(target: string, peerId: string, siteId: string) {
        const conn = this.peer.connect(target);
        this.addToOutConns(conn);
        conn.on('open', () => {
            conn.send(JSON.stringify({
                type: 'connRequest',
                peerId: peerId,
                siteId: siteId,
            }));
        });
    }

    evaluateRequest(peerId: string, siteId: string) {
        if (this.hasReachedMax()) {
            this.forwardConnRequest(peerId, siteId);
        } else {
            this.acceptConnRequest(peerId, siteId);
        }
    }

    hasReachedMax() {
        const halfTheNetwork = Math.ceil(this.controller.network.length / 2);
        const tooManyInConns = this.inConns.length > Math.max(halfTheNetwork, 5);
        const tooManyOutConns = this.outConns.length > Math.max(halfTheNetwork, 5);

        return tooManyInConns || tooManyOutConns;
    }

    forwardConnRequest(peerId, siteId) {
        const connected = this.outConns.filter(conn => conn.peer !== peerId);
        const randomIdx = Math.floor(Math.random() * connected.length);
        connected[randomIdx].send(JSON.stringify({
            type: 'connRequest',
            peerId: peerId,
            siteId: siteId,
        }));
    }

    addToOutConns(connection) {
        if (!!connection && !this.isAlreadyConnectedOut(connection)) {
            this.outConns.push(connection);
        }
    }

    addToInConns(connection: any) {
        if (!!connection && !this.isAlreadyConnectedIn(connection)) {
            this.inConns.push(connection);
        }
    }

    addToNetwork(newPeer: string, newSite: string) {
        this.send({
            type: OperationType.ADD_TO_NETWORK,
            newPeer,
            newSite
        });
    }

    removeFromNetwork(oldPeer: string) {
        this.send({
            type: OperationType.REMOVE_FROM_NETWORK,
            oldPeer
        });
        // this.removeFromNetwork(peerId);
    }

    removeFromConnections(peer) {
        this.inConns = this.inConns.filter(conn => conn.peer !== peer);
        this.outConns = this.outConns.filter(conn => conn.peer !== peer);
        this.removeFromNetwork(peer);
    }

    isAlreadyConnectedOut(connection: IPeerConnection) {
        if (connection.peer) {
            return !!this.outConns.find(conn => conn.peer === connection.peer);
        } else {
            return !!this.outConns.find(conn => conn.peer.id === connection);
        }
    }

    isAlreadyConnectedIn(connection: any) {
        if (connection.peer) {
            return !!this.inConns.find(conn => conn.peer === connection.peer);
        } else {
            return !!this.inConns.find(conn => conn.peer.id === connection);
        }
    }

    onPeerConnection() {
        this.peer.on('connection', (connection: any) => {
            this.onConnection(connection);
            this.onData(connection);
            this.onConnClose(connection);
        });
    }

    acceptConnRequest(peerId, siteId) {
        const connBack = this.peer.connect(peerId);
        this.addToOutConns(connBack);
        this.addToNetwork(peerId, siteId);

        const initialData = JSON.stringify({
            type: 'syncResponse',
            siteId: this.controller.siteId,
            peerId: this.peer.id,
            initialStruct: this.controller.crdt.struct,
            initialVersions: this.controller.vector.versions,
            network: this.controller.network
        });

        if (connBack.open) {
            connBack.send(initialData);
        } else {
            connBack.on('open', () => {
                connBack.send(initialData);
            });
        }
    }

    onConnection(connection: IPeerConnection) {
        this.updateRootUrl && this.updateRootUrl(connection.peer);
        this.addToInConns(connection);
    }

    onData(connection: any) {
        connection.on('data', data => {
            const dataObj = JSON.parse(data);

            switch (dataObj.type) {
                case 'connRequest':
                    this.evaluateRequest(dataObj.peerId, dataObj.siteId);
                    break;
                case 'syncResponse':
                    this.processOutgoingBuffer(dataObj.peerId);
                    this.controller.handleSync(dataObj);
                    break;
                case 'syncCompleted':
                    this.processOutgoingBuffer(dataObj.peerId);
                    break;
                case OperationType.ADD_TO_NETWORK:
                    this.controller.addToNetwork(dataObj.newPeer, dataObj.newSite);
                    break;
                case 'remove from network':
                    this.controller.removeFromNetwork(dataObj.oldPeer);
                    break;
                default:
                    this.controller.handleRemoteOperation(dataObj);
            }
        });
    }

    randomId() {
        const possConns = this.inConns.filter(conn => {
            return this.peer.id !== conn.peer;
        });
        const randomIdx = Math.floor(Math.random() * possConns.length);
        if (possConns[randomIdx]) {
            return possConns[randomIdx].peer;
        } else {
            return false;
        }
    }

    onConnClose(connection: IPeerConnection) {
        connection.on('close', () => {
            this.removeFromConnections(connection.peer);
            if (connection.peer == this.urlId) {
                const id = this.randomId();
                if (id) { this.updatePageURL(id); }
            }
            if (!this.hasReachedMax()) {
                this.findNewTarget();
            }
        });
    }
    findNewTarget() {
        throw new Error("Method not implemented.");
    }
    updatePageURL(id: any) {
        this.urlId = id;
        const newURL = window.location.origin + '?' + id;
        window.history.pushState({}, '', newURL);
    }
    updateRootUrl(id: string) {
        if (!this.urlId) {
            this.updatePageURL(id);
        }
    }
    enableEditor() {
        throw new Error("Method not implemented.");
    }
    lostConnection() {
        throw new Error("Method not implemented.");
    }

}

export default Broadcast;
