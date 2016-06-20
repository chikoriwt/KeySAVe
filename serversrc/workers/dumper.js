import * as KeySAV from 'keysavcore';
import SaveKey from 'keysavcore/save-key';
import BattleVideoKey from 'keysavcore/battle-video-key';
import * as path from 'path';
import * as fs from 'fs-extra';
import Promise from 'bluebird';
import logger from './logger';

logger.info('Dumper process started');

function bufToArr(buf: Buffer) {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function serializeError(e: Error) {
  return {
    message: e.message,
    name: e.name,
    props: Object.assign({}, e)
  };
}

var dataDirectory = process.argv[3];
fs.mkdirpSync(dataDirectory);
var store = new KeySAV.KeyStoreFileSystem(dataDirectory);
KeySAV.setKeyStore(store);

logger.verbose(`Loading keys from ${dataDirectory}`);

async function close() {
  logger.info('Shutting down dumper process');
  await store.close();
  process.exit();
}

async function breakFolder(args) {
  try {
    logger.verbose(`Loading folder ${args.folder} to scan for saves`);
    await fs.readdirAsync(args.folder)
      .map(async (fileName) => {
        try {
          var file = path.join(args.folder, fileName);
          var stat = await fs.statAsync(file);
          if (stat.isDirectory()) return null;
          switch (stat.size) {
            case 0x100000:
            case 0x10009C:
            case 0x10019A:
              break;
            default:
              return null;
          }
          logger.silly(`Scanning file ${fileName}`);
          var buf = await fs.readFileAsync(file);
          var arr = bufToArr(buf);
          var reader = await KeySAV.loadSav(arr);
          reader.scanSlots();
          return null;
        } catch (e) { /* ignore */ }
      });
    process.send({ id: args.id });
  } catch (e) {
    logger.error('An error occured trying to scan saves: ', e);
    process.send({ err: serializeError(e), id: args.id });
  }
}

async function dumpSaveOrBv(args) {
  try {
    logger.verbose(`Loading file ${args.file}`);
    var file = bufToArr(await fs.readFileAsync(args.file));
    var res = await KeySAV.loadSavOrBv(file);
    var reader = res.reader;
    if (res.type === 'SAV') {
      logger.verbose(`File ${args.file} is a save file`);
      process.send({ res: { pokemon: reader.getAllPkx(), goodKey: reader.isNewKey, type: 'SAV', name: args.file }, id: args.id });
    } else {
      logger.verbose(`File ${args.file} is a battle video`);
      process.send({ res: { pokemon: reader.getAllPkx(), goodKey: reader.dumpsOpponent, type: 'BV', name: args.file }, id: args.id });
    }
  } catch (e) {
    if (e.name === 'NotASaveOrBattleVideoError' || e.name === 'NoKeyAvailableError') {
      logger.verbose('An error occured trying to open ', args.file, ': ', e);
    } else {
      logger.error('An error occured trying to open ', args.file, ': ', e);
    }
    process.send({ err: serializeError(e), id: args.id });
  }
}

async function breakKey(args) {
  try {
    logger.verbose(`Trying to create a key with ${args.file1} and ${args.file2}`);
    var files = await Promise.map([fs.readFileAsync(args.file1), fs.readFileAsync(args.file2)], bufToArr);
    var res = await KeySAV.breakSavOrBv(files[0], files[1]);
    logger.verbose(`Key creation returned ${res}`);
    process.send({ res, id: args.id });
  } catch (e) {
    if (e.name === 'NotSameFileTypeError' || e.name === 'NotSameBattleVideoSlotError' || e.name === 'BattleVideoKeyAlreadyExistsError' || e.name === 'BattleVideoBreakError' || e.name === 'NotSameGameError' || e.name === 'SaveIdenticalError' || e.name === 'SaveKeyAlreadyExistsError' || e.name === 'NoBoxesError' || e.name === 'PokemonNotSuitableError') {
      logger.verbose('An error occured trying to create a key: ', e);
    } else {
      logger.error('An error occured trying to create a key: ', e);
    }
    process.send({ err: serializeError(e), id: args.id });
  }
}

async function mergeKeyFolder(args) {
  try {
    logger.verbose(`Merging all keys from ${args.folder} with own keys`);
    const files = await fs.readdirAsync(args.folder);
    let counter = 0;
    for (const file of files) {
      const filePath = args.folder + '/' + file;
      const stats = await fs.statAsync(filePath);
      if (stats.isFile() && (stats.size === 0xB4AD4 || stats.size === 0x80000)) {
        ++counter;
        logger.silly(`Merging save key from ${file}`);
        const buf = new Buffer(0xB4AD4);
        const fd = await fs.openAsync(filePath, 'r');
        await fs.readAsync(fd, buf, 0, stats.size, 0);
        await fs.closeAsync(fd);
        const ui8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        const key = new SaveKey(ui8);
        store.setOrMergeSaveKey(key);
      } else if (stats.isFile() && stats.size === 0x1000) {
        ++counter;
        logger.silly(`Merging battle video key from ${file}`);
        const buf = await fs.readFileAsync(filePath);
        const ui8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        const key = new BattleVideoKey(ui8);
        store.setOrMergeBvKey(key);
      }
    }
    logger.info(`Merged ${counter} files`);
    process.send({ id: args.id });
  } catch (e) {
    logger.error('An error occured trying to merge keys: ', e);
    process.send({ err: serializeError(e), id: args.id });
  }
}

process.on('message', function handleMessage(m) {
  switch (m.cmd) {
    case 'dump-save-or-bv':
      dumpSaveOrBv(m);
      break;
    case 'break-key':
      breakKey(m);
      break;
    case 'break-folder':
      breakFolder(m);
      break;
    case 'close':
      close();
      break;
    case 'merge-key-folder':
      mergeKeyFolder(m);
      break;
    default:
  }
});
