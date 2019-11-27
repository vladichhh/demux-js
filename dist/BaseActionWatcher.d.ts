import * as Logger from 'bunyan';
import { AbstractActionHandler } from './AbstractActionHandler';
import { AbstractActionReader } from './AbstractActionReader';
import { DemuxInfo } from './interfaces';
/**
 * Coordinates implementations of `AbstractActionReader`s and `AbstractActionHandler`s in
 * a polling loop.
 */
export declare class BaseActionWatcher {
    protected actionReader: AbstractActionReader;
    protected actionHandler: AbstractActionHandler;
    protected pollInterval: number;
    /**
     * @param actionReader    An instance of an implemented `AbstractActionReader`
     * @param actionHandler   An instance of an implemented `AbstractActionHandler`
     * @param pollInterval    Number of milliseconds between each polling loop iteration
     */
    protected log: Logger;
    private running;
    private shouldPause;
    private error;
    private clean;
    constructor(actionReader: AbstractActionReader, actionHandler: AbstractActionHandler, pollInterval: number);
    /**
     * Starts a polling loop running in replay mode.
     */
    replay(): Promise<void>;
    /**
     * Start a polling loop
     *
     * @param isReplay  Set to true to disable Effects from running until caught up with head block.
     */
    watch(isReplay?: boolean): Promise<void>;
    /**
     * Start or resume indexing.
     */
    start(): boolean;
    /**
     * Suspend indexing. Will go into effect after the currently-processing block.
     */
    pause(): boolean;
    /**
     * Information about the current state of Demux
     */
    readonly info: DemuxInfo;
    /**
     * Use the actionReader and actionHandler to process new blocks.
     *
     * @param isReplay  Set to true to disable Effects from running until caught up with head block.
     */
    protected checkForBlocks(isReplay?: boolean): Promise<void>;
    private readonly status;
}
