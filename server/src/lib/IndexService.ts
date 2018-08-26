import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { SymbolIndex } from 'coffeescript-lsp-core';

const INDEXER_CLI_PATH = path.resolve(__dirname, '../../node_modules/coffeescript-lsp-core/dist/bin/coffeescript-symbol-indexer.js');

export class IndexService {
  public symbolIndex: SymbolIndex;
  public dbFilename: string;

  constructor(dbFilename: string) {
    this.dbFilename = dbFilename;
    this.symbolIndex = new SymbolIndex(this.dbFilename);
    console.log('Symbols DB:', this.dbFilename);
  }

  public async find(query: string) {
    if (query.length > 0) {
      return this.symbolIndex.find(query);
    } else {
      return [];
    }
  }

  public async indexFilesInBackground(uris: string[]): Promise<any> {
    console.log(new Date(), 'index with sub processes');

    const args = ['-d', this.dbFilename];

    if (!fs.existsSync(INDEXER_CLI_PATH)) {
      throw new Error(`Indexer does not exist: ${INDEXER_CLI_PATH}`);
    }

    const promise = new Promise((resolve, reject) => {
      const proc = cp.fork(INDEXER_CLI_PATH, args, {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      });

      proc.on('message', (params) => {
        if (params.done) {
          console.info(new Date(), 'Indexer done');
          proc.kill();
          resolve();
        } else {
          throw new TypeError(`Unknown message from child: ${params}`);
        }
      });

      proc.on('exit', (code) => {
        if (code !== 0) { reject('Indexer exited with non-zero code'); }
        console.info(new Date(), 'Indexer exited');
        resolve();
      });

      proc.on('uncaughtException', (err) => {
        console.error(new Date(), 'Indexer Failed');
        console.error(new Date(), err.stack);
        reject(err);
      });

      proc.on('error', (err) => {
        console.error(new Date(), 'Indexer Failed');
        console.error(new Date(), err.stack);
        reject(err);
      });

      proc.send({ files: uris });
    });

    return promise;
  }

  public async indexFilesInForeground(uris: string[]): Promise<any> {
    console.log('index in foreground');
    return Promise.all(uris.map((uri: string) => this.symbolIndex.indexFile(uri)));
  }

  public async removeFiles(uris: string[]) {
    return Promise.all(uris.map((uri: string) => this.symbolIndex.removeFile(uri)));
  }

  public async shutdown() {
    return this.symbolIndex.destroy();
  }
}
