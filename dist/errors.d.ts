export declare class MismatchedBlockHashError extends Error {
    constructor();
}
export declare class MissingHandlerVersionError extends Error {
    constructor();
}
export declare class DuplicateHandlerVersionError extends Error {
    constructor(versionName: string);
}
export declare class ImproperStartAtBlockError extends Error {
    constructor();
}
export declare class ImproperSeekToBlockError extends Error {
    constructor(blockNumber: number);
}
export declare class ReloadHistoryError extends Error {
    constructor();
}
export declare class UnresolvedForkError extends Error {
    constructor();
}
declare class RethrownError extends Error {
    constructor(message: string, error?: Error);
    private extendStack;
}
export declare class NotInitializedError extends RethrownError {
    constructor(message?: string, error?: Error);
}
export {};
