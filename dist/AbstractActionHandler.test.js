"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = require("./errors");
const blockchains_1 = __importDefault(require("./testHelpers/blockchains"));
const TestActionHandler_1 = require("./testHelpers/TestActionHandler");
const { blockchain, upgradeHandler } = blockchains_1.default;
describe('Action Handler', () => {
    let actionHandler;
    let runUpdater;
    let runEffect;
    let notRunUpdater;
    let notRunEffect;
    let runUpgradeUpdater;
    let runUpdaterAfterUpgrade;
    let runEffectAfterUpgrade;
    let notRunUpdaterAfterUpgrade;
    let notRunEffectAfterUpgrade;
    beforeEach(() => {
        runUpdater = jest.fn();
        runEffect = jest.fn();
        notRunUpdater = jest.fn();
        notRunEffect = jest.fn();
        runUpgradeUpdater = jest.fn().mockReturnValue('v2');
        runUpdaterAfterUpgrade = jest.fn();
        runEffectAfterUpgrade = jest.fn();
        notRunUpdaterAfterUpgrade = jest.fn();
        notRunEffectAfterUpgrade = jest.fn();
        actionHandler = new TestActionHandler_1.TestActionHandler([
            {
                versionName: 'v1',
                updaters: [
                    {
                        actionType: 'eosio.token::transfer',
                        apply: runUpdater,
                    },
                    {
                        actionType: 'mycontract::upgrade',
                        apply: runUpgradeUpdater,
                    },
                    {
                        actionType: 'eosio.token::issue',
                        apply: notRunUpdater,
                    },
                ],
                effects: [
                    {
                        actionType: 'eosio.token::transfer',
                        run: runEffect,
                        deferUntilIrreversible: true,
                    },
                    {
                        actionType: 'eosio::bidname',
                        run: runEffect,
                        deferUntilIrreversible: true,
                    },
                    {
                        actionType: 'eosio.token::issue',
                        run: notRunEffect,
                        deferUntilIrreversible: true,
                    },
                ],
            },
            {
                versionName: 'v2',
                updaters: [
                    {
                        actionType: 'eosio.token::transfer',
                        apply: notRunUpdaterAfterUpgrade,
                    },
                    {
                        actionType: 'eosio.token::issue',
                        apply: runUpdaterAfterUpgrade,
                    },
                ],
                effects: [
                    {
                        actionType: 'eosio.token::transfer',
                        run: notRunEffectAfterUpgrade,
                        deferUntilIrreversible: true,
                    },
                    {
                        actionType: 'eosio.token::issue',
                        run: runEffectAfterUpgrade,
                        deferUntilIrreversible: true,
                    },
                ],
            },
        ]);
        actionHandler.isInitialized = true;
    });
    it('runs the correct updater based on action type', () => __awaiter(this, void 0, void 0, function* () {
        yield actionHandler._applyUpdaters({}, blockchain[1], {}, false);
        expect(runUpdater).toHaveBeenCalledTimes(1);
        expect(notRunUpdater).not.toHaveBeenCalled();
    }));
    it('runs the correct effect based on action type', () => __awaiter(this, void 0, void 0, function* () {
        const versionedActions = yield actionHandler._applyUpdaters({}, blockchain[1], {}, false);
        const blockMeta = {
            isRollback: false,
            isEarliestBlock: true,
            isNewBlock: true,
        };
        const nextBlock = {
            block: blockchain[1],
            blockMeta,
            lastIrreversibleBlockNumber: 2,
        };
        actionHandler._runEffects(versionedActions, {}, nextBlock);
        expect(runEffect).toHaveBeenCalledTimes(2);
        expect(notRunEffect).not.toHaveBeenCalled();
    }));
    it('retrieves indexState when processing first block', () => __awaiter(this, void 0, void 0, function* () {
        actionHandler.state.indexState = {
            blockNumber: 3,
            blockHash: '000f42401b5636c3c1d88f31fe0e503654091fb822b0ffe21c7d35837fc9f3d8',
        };
        const blockMeta = {
            isRollback: false,
            isEarliestBlock: true,
            isNewBlock: true,
        };
        const nextBlock = {
            block: blockchain[0],
            blockMeta,
            lastIrreversibleBlockNumber: 1,
        };
        const seekBlockNum = yield actionHandler.handleBlock(nextBlock, false);
        expect(seekBlockNum).toBe(4);
    }));
    it('seeks to the next block needed when block number doesn\'t match last processed block', () => __awaiter(this, void 0, void 0, function* () {
        actionHandler.setLastProcessedBlockNumber(blockchain[1].blockInfo.blockNumber);
        actionHandler.setLastProcessedBlockHash(blockchain[1].blockInfo.blockHash);
        actionHandler.state.indexState = Object.assign({}, actionHandler.state.indexState, { blockNumber: blockchain[1].blockInfo.blockNumber, blockHash: blockchain[1].blockInfo.blockHash });
        const blockMeta = {
            isRollback: false,
            isEarliestBlock: false,
            isNewBlock: true,
        };
        const nextBlock = {
            block: blockchain[3],
            blockMeta,
            lastIrreversibleBlockNumber: 1,
        };
        const seekBlockNum = yield actionHandler.handleBlock(nextBlock, false);
        expect(seekBlockNum).toBe(3);
    }));
    it('throws error if previous block hash and last processed don\'t match up', () => __awaiter(this, void 0, void 0, function* () {
        actionHandler.setLastProcessedBlockNumber(3);
        actionHandler.setLastProcessedBlockHash('asdfasdfasdf');
        const blockMeta = {
            isRollback: false,
            isEarliestBlock: false,
            isNewBlock: true,
        };
        const nextBlock = {
            block: blockchain[3],
            blockMeta,
            lastIrreversibleBlockNumber: 1,
        };
        const result = actionHandler.handleBlock(nextBlock, false);
        // tslint:disable-next-line:no-floating-promises
        expect(result).rejects.toThrow(errors_1.MismatchedBlockHashError);
    }));
    it('upgrades the action handler correctly', () => __awaiter(this, void 0, void 0, function* () {
        const blockMeta = {
            isRollback: false,
            isEarliestBlock: true,
            isNewBlock: true,
        };
        const nextBlock = {
            block: upgradeHandler[0],
            blockMeta,
            lastIrreversibleBlockNumber: 2,
        };
        const versionedActions = yield actionHandler._applyUpdaters({}, upgradeHandler[0], {}, false);
        actionHandler._runEffects(versionedActions, {}, nextBlock);
        expect(actionHandler._handlerVersionName).toEqual('v2');
        expect(runUpdater).toHaveBeenCalledTimes(1);
        expect(runEffect).toHaveBeenCalledTimes(2);
        expect(runUpgradeUpdater).toHaveBeenCalledTimes(1);
        expect(notRunUpdater).not.toHaveBeenCalled();
        expect(notRunUpdaterAfterUpgrade).not.toHaveBeenCalled();
        expect(runUpdaterAfterUpgrade).toHaveBeenCalledTimes(1);
        expect(notRunEffectAfterUpgrade).not.toHaveBeenCalled();
        expect(runEffectAfterUpgrade).toHaveBeenCalledTimes(1);
    }));
    it('defers the effects until the block is irreversible', () => __awaiter(this, void 0, void 0, function* () {
        const blockMeta = {
            isRollback: false,
            isEarliestBlock: true,
            isNewBlock: true,
        };
        const nextBlock = {
            block: upgradeHandler[0],
            blockMeta,
            lastIrreversibleBlockNumber: 1,
        };
        const versionedActions = yield actionHandler._applyUpdaters({}, upgradeHandler[0], {}, false);
        actionHandler._runEffects(versionedActions, {}, nextBlock);
        expect(runEffect).not.toHaveBeenCalled();
        expect(runEffectAfterUpgrade).not.toHaveBeenCalled();
        const blockMeta2 = {
            isRollback: false,
            isEarliestBlock: false,
            isNewBlock: true,
        };
        const nextBlock2 = {
            block: upgradeHandler[1],
            blockMeta: blockMeta2,
            lastIrreversibleBlockNumber: 2,
        };
        const versionedActions2 = yield actionHandler._applyUpdaters({}, upgradeHandler[1], {}, false);
        actionHandler._runEffects(versionedActions2, {}, nextBlock2);
        expect(runEffect).toHaveBeenCalledTimes(2);
        expect(runEffectAfterUpgrade).toHaveBeenCalledTimes(1);
    }));
    it('rolls back', () => __awaiter(this, void 0, void 0, function* () {
        const blockMeta1 = {
            isRollback: false,
            isEarliestBlock: true,
            isNewBlock: true,
        };
        const nextBlock1 = {
            block: blockchain[0],
            blockMeta: blockMeta1,
            lastIrreversibleBlockNumber: 1,
        };
        yield actionHandler.handleBlock(nextBlock1, false);
        const blockMeta2 = {
            isRollback: false,
            isEarliestBlock: false,
            isNewBlock: true,
        };
        const nextBlock2 = {
            block: blockchain[1],
            blockMeta: blockMeta2,
            lastIrreversibleBlockNumber: 1,
        };
        yield actionHandler.handleBlock(nextBlock2, false);
        const blockMeta3 = {
            isRollback: false,
            isEarliestBlock: false,
            isNewBlock: true,
        };
        const nextBlock3 = {
            block: blockchain[2],
            blockMeta: blockMeta3,
            lastIrreversibleBlockNumber: 1,
        };
        yield actionHandler.handleBlock(nextBlock3, false);
        // Roll back
        const rollbackMeta = {
            isRollback: true,
            isEarliestBlock: false,
            isNewBlock: true,
        };
        const rollback2 = {
            block: blockchain[1],
            blockMeta: rollbackMeta,
            lastIrreversibleBlockNumber: 1,
        };
        yield actionHandler.handleBlock(rollback2, false);
        expect(actionHandler.lastProcessedBlockNumber).toEqual(2);
    }));
    it(`doesn't run effects from orphaned blocks`, () => __awaiter(this, void 0, void 0, function* () {
        const blockMeta1 = {
            isRollback: false,
            isEarliestBlock: true,
            isNewBlock: true,
        };
        const nextBlock1 = {
            block: blockchain[0],
            blockMeta: blockMeta1,
            lastIrreversibleBlockNumber: 1,
        };
        yield actionHandler.handleBlock(nextBlock1, false);
        const blockMeta2 = {
            isRollback: false,
            isEarliestBlock: false,
            isNewBlock: true,
        };
        const nextBlock2 = {
            block: blockchain[1],
            blockMeta: blockMeta2,
            lastIrreversibleBlockNumber: 1,
        };
        yield actionHandler.handleBlock(nextBlock2, false);
        const blockMeta3 = {
            isRollback: false,
            isEarliestBlock: false,
            isNewBlock: true,
        };
        const nextBlock3 = {
            block: blockchain[2],
            blockMeta: blockMeta3,
            lastIrreversibleBlockNumber: 1,
        };
        yield actionHandler.handleBlock(nextBlock3, false);
        const rollbackMeta = {
            isRollback: true,
            isEarliestBlock: false,
            isNewBlock: true,
        };
        const rollback2 = {
            block: blockchain[1],
            blockMeta: rollbackMeta,
            lastIrreversibleBlockNumber: 1,
        };
        yield actionHandler.handleBlock(rollback2, false);
        const incrementIrreversible3 = {
            block: upgradeHandler[1],
            blockMeta: blockMeta3,
            lastIrreversibleBlockNumber: 2,
        };
        yield actionHandler.handleBlock(incrementIrreversible3, false);
        expect(runEffect).toHaveBeenCalledTimes(2);
        expect(notRunEffect).not.toHaveBeenCalled();
    }));
    it('continues if initialization succeeds', () => __awaiter(this, void 0, void 0, function* () {
        actionHandler.state.indexState = {
            blockNumber: 3,
            blockHash: '000f42401b5636c3c1d88f31fe0e503654091fb822b0ffe21c7d35837fc9f3d8',
        };
        const blockMeta = {
            isRollback: false,
            isEarliestBlock: true,
            isNewBlock: true,
        };
        const nextBlock = {
            block: blockchain[0],
            blockMeta,
            lastIrreversibleBlockNumber: 1,
        };
        actionHandler.isInitialized = true;
        const seekBlockNum = yield actionHandler.handleBlock(nextBlock, false);
        expect(seekBlockNum).toBe(4);
    }));
    it('throws if iniatilization fails', () => __awaiter(this, void 0, void 0, function* () {
        actionHandler.state.indexState = {
            blockNumber: 3,
            blockHash: '000f42401b5636c3c1d88f31fe0e503654091fb822b0ffe21c7d35837fc9f3d8',
        };
        const blockMeta = {
            isRollback: false,
            isEarliestBlock: true,
            isNewBlock: true,
        };
        const nextBlock = {
            block: blockchain[0],
            blockMeta,
            lastIrreversibleBlockNumber: 1,
        };
        actionHandler.isInitialized = false;
        const result = actionHandler.handleBlock(nextBlock, false);
        // tslint:disable-next-line:no-floating-promises
        expect(result).rejects.toThrow(errors_1.NotInitializedError);
    }));
});
//# sourceMappingURL=AbstractActionHandler.test.js.map