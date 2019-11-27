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
const interfaces_1 = require("./interfaces");
/**
 * Coordinates implementations of `AbstractActionReader`s and `AbstractActionHandler`s in
 * a polling loop.
 */
class BaseActionWatcher {
    constructor(actionReader, actionHandler, pollInterval) {
        this.actionReader = actionReader;
        this.actionHandler = actionHandler;
        this.pollInterval = pollInterval;
        this.running = false;
        this.shouldPause = false;
        this.error = null;
        this.clean = true;
        this.log = Logger.createLogger({ name: 'demux' });
    }
    /**
     * Starts a polling loop running in replay mode.
     */
    replay() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.watch(true);
        });
    }
    /**
     * Start a polling loop
     *
     * @param isReplay  Set to true to disable Effects from running until caught up with head block.
     */
    watch(isReplay = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.shouldPause) {
                this.running = false;
                this.shouldPause = false;
                this.log.info('Indexing paused.');
                return;
            }
            this.clean = false;
            this.running = true;
            this.error = null;
            const startTime = Date.now();
            try {
                yield this.checkForBlocks(isReplay);
            }
            catch (err) {
                this.running = false;
                this.shouldPause = false;
                this.log.error(err);
                this.error = err;
                this.log.info('Indexing unexpectedly paused due to an error.');
                yield this.watch(false);
            }
            const endTime = Date.now();
            const duration = endTime - startTime;
            let waitTime = this.pollInterval - duration;
            if (waitTime < 0) {
                waitTime = 0;
            }
            setTimeout(() => __awaiter(this, void 0, void 0, function* () { return yield this.watch(false); }), waitTime);
        });
    }
    /**
     * Start or resume indexing.
     */
    start() {
        if (this.running) {
            this.log.info('Cannot start; already indexing.');
            return false;
        }
        this.log.info('Starting indexing.');
        // tslint:disable-next-line:no-floating-promises
        this.watch();
        return true;
    }
    /**
     * Suspend indexing. Will go into effect after the currently-processing block.
     */
    pause() {
        if (!this.running) {
            this.log.info('Cannot pause; not currently indexing.');
            return false;
        }
        this.log.info('Pausing indexing.');
        this.shouldPause = true;
        return true;
    }
    /**
     * Information about the current state of Demux
     */
    get info() {
        const info = {
            handler: this.actionHandler.info,
            reader: this.actionReader.info,
            indexingStatus: this.status,
        };
        if (this.error) {
            info.error = this.error;
        }
        return info;
    }
    /**
     * Use the actionReader and actionHandler to process new blocks.
     *
     * @param isReplay  Set to true to disable Effects from running until caught up with head block.
     */
    checkForBlocks(isReplay = false) {
        return __awaiter(this, void 0, void 0, function* () {
            let headBlockNumber = 0;
            while (!headBlockNumber || this.actionReader.currentBlockNumber < headBlockNumber) {
                if (this.shouldPause) {
                    return;
                }
                const nextBlock = yield this.actionReader.getNextBlock();
                if (!nextBlock.blockMeta.isNewBlock) {
                    break;
                }
                const nextBlockNumberNeeded = yield this.actionHandler.handleBlock(nextBlock, isReplay);
                if (nextBlockNumberNeeded) {
                    yield this.actionReader.seekToBlock(nextBlockNumberNeeded);
                }
                headBlockNumber = this.actionReader.headBlockNumber;
            }
        });
    }
    get status() {
        if (this.clean) {
            return interfaces_1.IndexingStatus.Initial;
        }
        if (this.running && !this.shouldPause) {
            return interfaces_1.IndexingStatus.Indexing;
        }
        if (this.running && this.shouldPause) {
            return interfaces_1.IndexingStatus.Pausing;
        }
        if (this.error) {
            return interfaces_1.IndexingStatus.Stopped;
        }
        return interfaces_1.IndexingStatus.Paused;
    }
}
exports.BaseActionWatcher = BaseActionWatcher;
//# sourceMappingURL=BaseActionWatcher.js.map