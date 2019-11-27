"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const Logger = __importStar(require("bunyan"));
const errors_1 = require("./errors");
/**
 * Takes `block`s output from implementations of `AbstractActionReader` and processes their actions through the
 * `Updater`s and `Effect`s of the current `HandlerVersion`. Pass an object exposing a persistence API as `state` to the
 * `handleWithState` method. Persist and retrieve information about the last block processed with `updateIndexState` and
 * `loadIndexState`. Implement `rollbackTo` to handle when a fork is encountered.
 *
 */
class AbstractActionHandler {
    /**
     * @param handlerVersions  An array of `HandlerVersion`s that are to be used when processing blocks. The default
     *                         version name is `"v1"`.
     */
    constructor(handlerVersions) {
        this.lastProcessedBlockNumber = 0;
        this.lastProcessedBlockHash = '';
        this.handlerVersionName = 'v1';
        this.initialized = false;
        this.deferredEffects = {};
        this.handlerVersionMap = {};
        this.initHandlerVersions(handlerVersions);
        this.log = Logger.createLogger({ name: 'demux' });
    }
    /**
     * Receive block, validate, and handle actions with updaters and effects
     */
    handleBlock(nextBlock, isReplay) {
        return __awaiter(this, void 0, void 0, function* () {
            const { block, blockMeta } = nextBlock;
            const { blockInfo } = block;
            const { isRollback, isEarliestBlock } = blockMeta;
            if (!this.initialized) {
                yield this.initialize();
                this.initialized = true;
            }
            yield this.handleRollback(isRollback, blockInfo.blockNumber, isReplay, isEarliestBlock);
            const nextBlockNeeded = this.lastProcessedBlockNumber + 1;
            // Just processed this block; skip
            if (blockInfo.blockNumber === this.lastProcessedBlockNumber
                && blockInfo.blockHash === this.lastProcessedBlockHash) {
                return null;
            }
            // If it's the first block but we've already processed blocks, seek to next block
            if (isEarliestBlock && this.lastProcessedBlockHash) {
                return nextBlockNeeded;
            }
            // Only check if this is the block we need if it's not the first block
            if (!isEarliestBlock) {
                if (blockInfo.blockNumber !== nextBlockNeeded) {
                    return nextBlockNeeded;
                }
                // Block sequence consistency should be handled by the ActionReader instance
                if (blockInfo.previousBlockHash !== this.lastProcessedBlockHash) {
                    const err = new errors_1.MismatchedBlockHashError();
                    throw err;
                }
            }
            const handleWithArgs = (state, context = {}) => __awaiter(this, void 0, void 0, function* () {
                yield this.handleActions(state, context, nextBlock, isReplay);
            });
            yield this.handleWithState(handleWithArgs);
            return null;
        });
    }
    /**
     * Information about the current state of the Action Handler
     */
    get info() {
        return {
            lastProcessedBlockNumber: this.lastProcessedBlockNumber,
            lastProcessedBlockHash: this.lastProcessedBlockHash,
            handlerVersionName: this.handlerVersionName,
        };
    }
    /**
     * Performs all required initialization for the handler.
     */
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.setup();
            yield this.refreshIndexState();
        });
    }
    /**
     * This method is used when matching the types of incoming actions against the types the `Updater`s and `Effect`s are
     * subscribed to. When this returns true, their corresponding functions will run.
     *
     * By default, this method tests for direct equivalence between the incoming candidate type and the type that is
     * subscribed. Override this method to extend this functionality (e.g. wildcards).
     *
     * @param candidateType   The incoming action's type
     * @param subscribedType  The type the Updater of Effect is subscribed to
     */
    matchActionType(candidateType, subscribedType) {
        return candidateType === subscribedType;
    }
    /**
     * Process actions against deterministically accumulating `Updater` functions. Returns a promise of versioned actions
     * for consumption by `runEffects`, to make sure the correct effects are run on blocks that include a `HandlerVersion`
     * change. To change a `HandlerVersion`, have an `Updater` function return the `versionName` of the corresponding
     * `HandlerVersion` you want to change to.
     */
    applyUpdaters(state, block, context, isReplay) {
        return __awaiter(this, void 0, void 0, function* () {
            const versionedActions = [];
            const { actions, blockInfo } = block;
            for (const action of actions) {
                let updaterIndex = -1;
                for (const updater of this.handlerVersionMap[this.handlerVersionName].updaters) {
                    updaterIndex += 1;
                    if (this.matchActionType(action.type, updater.actionType)) {
                        const { payload } = action;
                        const newVersion = yield updater.apply(state, payload, blockInfo, context);
                        if (newVersion && !this.handlerVersionMap.hasOwnProperty(newVersion)) {
                            this.warnHandlerVersionNonexistent(newVersion);
                        }
                        else if (newVersion) {
                            this.log.info(`BLOCK ${blockInfo.blockNumber}: Updating Handler Version to '${newVersion}'`);
                            this.warnSkippingUpdaters(updaterIndex, action.type);
                            yield this.updateIndexState(state, block, isReplay, newVersion, context);
                            this.handlerVersionName = newVersion;
                            break;
                        }
                    }
                }
                versionedActions.push({
                    action,
                    handlerVersionName: this.handlerVersionName,
                });
            }
            return versionedActions;
        });
    }
    /**
     * Process versioned actions against asynchronous side effects.
     */
    runEffects(versionedActions, context, nextBlock) {
        this.runDeferredEffects(nextBlock.lastIrreversibleBlockNumber);
        for (const { action, handlerVersionName } of versionedActions) {
            for (const effect of this.handlerVersionMap[handlerVersionName].effects) {
                if (this.matchActionType(action.type, effect.actionType)) {
                    this.runOrDeferEffect(effect, action.payload, nextBlock, context);
                }
            }
        }
    }
    /**
     * Calls `applyUpdaters` and `runEffects` on the given actions
     */
    handleActions(state, context, nextBlock, isReplay) {
        return __awaiter(this, void 0, void 0, function* () {
            const { block } = nextBlock;
            const { blockInfo } = block;
            const versionedActions = yield this.applyUpdaters(state, block, context, isReplay);
            if (!isReplay) {
                this.runEffects(versionedActions, context, nextBlock);
            }
            yield this.updateIndexState(state, block, isReplay, this.handlerVersionName, context);
            this.lastProcessedBlockNumber = blockInfo.blockNumber;
            this.lastProcessedBlockHash = blockInfo.blockHash;
        });
    }
    handleRollback(isRollback, blockNumber, isReplay, isEarliestBlock) {
        return __awaiter(this, void 0, void 0, function* () {
            if (isRollback || (isReplay && isEarliestBlock)) {
                const rollbackBlockNumber = blockNumber - 1;
                const rollbackCount = this.lastProcessedBlockNumber - rollbackBlockNumber;
                this.log.info(`Rolling back ${rollbackCount} blocks to block ${rollbackBlockNumber}...`);
                yield this.rollbackTo(rollbackBlockNumber);
                this.rollbackDeferredEffects(blockNumber);
                yield this.refreshIndexState();
            }
            else if (this.lastProcessedBlockNumber === 0 && this.lastProcessedBlockHash === '') {
                yield this.refreshIndexState();
            }
        });
    }
    range(start, end) {
        return Array(end - start).fill(0).map((_, i) => i + start);
    }
    runOrDeferEffect(effect, payload, nextBlock, context) {
        const { block, lastIrreversibleBlockNumber } = nextBlock;
        const { blockNumber } = block.blockInfo;
        const shouldRunImmediately = (!effect.deferUntilIrreversible || block.blockInfo.blockNumber <= lastIrreversibleBlockNumber);
        if (shouldRunImmediately) {
            effect.run(payload, block, context);
        }
        else {
            if (!this.deferredEffects[blockNumber]) {
                this.deferredEffects[blockNumber] = [];
            }
            this.deferredEffects[blockNumber].push(() => effect.run(payload, block, context));
        }
    }
    runDeferredEffects(lastIrreversibleBlockNumber) {
        const nextDeferredBlockNumber = this.getNextDeferredBlockNumber();
        if (!nextDeferredBlockNumber) {
            return;
        }
        for (const blockNumber of this.range(nextDeferredBlockNumber, lastIrreversibleBlockNumber + 1)) {
            if (this.deferredEffects[blockNumber]) {
                const effects = this.deferredEffects[blockNumber];
                for (const deferredEffect of effects) {
                    deferredEffect();
                }
                delete this.deferredEffects[blockNumber];
            }
        }
    }
    getNextDeferredBlockNumber() {
        const blockNumbers = Object.keys(this.deferredEffects).map((num) => parseInt(num, 10));
        if (blockNumbers.length === 0) {
            return 0;
        }
        return Math.min(...blockNumbers);
    }
    rollbackDeferredEffects(rollbackTo) {
        const blockNumbers = Object.keys(this.deferredEffects).map((num) => parseInt(num, 10));
        const toRollBack = blockNumbers.filter((bn) => bn >= rollbackTo);
        for (const blockNumber of toRollBack) {
            delete this.deferredEffects[blockNumber];
        }
    }
    initHandlerVersions(handlerVersions) {
        if (handlerVersions.length === 0) {
            throw new errors_1.MissingHandlerVersionError();
        }
        for (const handlerVersion of handlerVersions) {
            if (this.handlerVersionMap.hasOwnProperty(handlerVersion.versionName)) {
                throw new errors_1.DuplicateHandlerVersionError(handlerVersion.versionName);
            }
            this.handlerVersionMap[handlerVersion.versionName] = handlerVersion;
        }
        if (!this.handlerVersionMap.hasOwnProperty(this.handlerVersionName)) {
            this.handlerVersionName = handlerVersions[0].versionName;
            this.warnMissingHandlerVersion(handlerVersions[0].versionName);
        }
        else if (handlerVersions[0].versionName !== 'v1') {
            this.warnIncorrectFirstHandler(handlerVersions[0].versionName);
        }
    }
    refreshIndexState() {
        return __awaiter(this, void 0, void 0, function* () {
            const { blockNumber, blockHash, handlerVersionName } = yield this.loadIndexState();
            this.lastProcessedBlockNumber = blockNumber;
            this.lastProcessedBlockHash = blockHash;
            this.handlerVersionName = handlerVersionName;
        });
    }
    warnMissingHandlerVersion(actualVersion) {
        this.log.warn(`No Handler Version found with name '${this.handlerVersionName}': starting with ` +
            `'${actualVersion}' instead.`);
    }
    warnIncorrectFirstHandler(actualVersion) {
        this.log.warn(`First Handler Version '${actualVersion}' is not '${this.handlerVersionName}', ` +
            `and there is also '${this.handlerVersionName}' present. Handler Version ` +
            `'${this.handlerVersionName}' will be used, even though it is not first.`);
    }
    warnHandlerVersionNonexistent(newVersion) {
        this.log.warn(`Attempted to switch to handler version '${newVersion}', however this version ` +
            `does not exist. Handler will continue as version '${this.handlerVersionName}'`);
    }
    warnSkippingUpdaters(updaterIndex, actionType) {
        const remainingUpdaters = this.handlerVersionMap[this.handlerVersionName].updaters.length - updaterIndex - 1;
        if (remainingUpdaters) {
            this.log.warn(`Handler Version was updated to version '${this.handlerVersionName}' while there ` +
                `were still ${remainingUpdaters} updaters left! These updaters will be skipped for the ` +
                `current action '${actionType}'.`);
        }
    }
}
exports.AbstractActionHandler = AbstractActionHandler;
//# sourceMappingURL=AbstractActionHandler.js.map