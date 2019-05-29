
export const enum OperationType {
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

export type Operation = LoadOperation | DataOperation
    | AddToNetworkOperation | InsertTextOperation | DeleteTextOperation
    | UpdateCursorOperation | UpdateSelectionOperation;