import { AbstractActionHandler } from '../AbstractActionHandler';
import { Block, IndexState, NextBlock, VersionedAction } from '../interfaces';
export declare class TestActionHandler extends AbstractActionHandler {
    isInitialized: boolean;
    state: any;
    private hashHistory;
    readonly _handlerVersionName: string;
    handleWithState(handle: (state: any) => void): Promise<void>;
    rollbackTo(blockNumber: number): Promise<void>;
    setLastProcessedBlockHash(hash: string): void;
    setLastProcessedBlockNumber(num: number): void;
    _applyUpdaters(state: any, block: Block, context: any, isReplay: boolean): Promise<VersionedAction[]>;
    _runEffects(versionedActions: VersionedAction[], context: any, nextBlock: NextBlock): void;
    protected loadIndexState(): Promise<IndexState>;
    handleBlock(nextBlock: NextBlock, isReplay: boolean): Promise<number | null>;
    protected updateIndexState(state: any, block: Block, isReplay: boolean, handlerVersionName: string): Promise<void>;
    protected setup(): Promise<void>;
}
