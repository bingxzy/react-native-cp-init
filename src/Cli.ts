import chalk from 'chalk';
import { CodeError, CodeErrors, CodeErrorType } from './CodeError';
import fs from 'fs';
import writePkg from 'write-pkg';
import path from 'path';
import { PKGList } from './LibList';
import axios from 'axios';
import extractZip from 'extract-zip';
// @ts-ignore
import mvdir from 'mvdir';
import { execSync } from 'child_process';
import yargs from 'yargs';

let RNVersion = '';
const argv = yargs
    .version(false)
    .strict(true)
    .options({
        verbose: {
            type: 'boolean',
            describe: 'Install log output',
            default: false,
        },
        path: {
            type: 'string',
            describe: 'setup package path (local or remote)',
            default: '',
        },
    })
    .strict(true).argv;

const hasYarn = (cwd: string = process.cwd()) => {
    return fs.existsSync(path.resolve(cwd, 'yarn.lock'));
};

const isArchiveRN = (version: string) => {
    const arr = version.split('.');
    const base = arr[1];
    if (base) {
        const baseNum = Number.parseInt(base, 10);
        return baseNum <= 59;
    } else {
        return false;
    }
};

const getRNversion = async (cwd: string = process.cwd()) => {
    try {
        const rnPkgJsonPath = require.resolve('react-native/package.json', {
            paths: [cwd],
        });
        const { version } = require(rnPkgJsonPath);
        console.log(chalk.grey('react-native version is ' + version));
        RNVersion = version;
        return version;
    } catch (error) {
        throw new CodeError(
            'NoReactNativeFound',
            'Must be run from a project that already depends on react-native, and has react-native installed.',
        );
    }
};

const dlTemplate = async (cwd: string = process.cwd()) => {
    console.log(chalk.grey('Downloading Template'));
    const tmpLink = path.resolve(cwd, 'Archive.zip');
    return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(tmpLink);
        const dlLink =
            'https://raw.githubusercontent.com/punszeto/react-native-template-cp/v1.0.1/template/Archive.zip';
        axios({
            method: 'GET',
            responseType: 'stream',
            url: dlLink,
        })
            .then(({ status, data }) => {
                if (status === 200) {
                    data.pipe(stream);
                    stream.on('finish', () => {
                        stream.close();
                        resolve(true);
                    });
                    stream.on('error', () => {
                        fs.unlinkSync(tmpLink);
                        reject(false);
                    });
                } else {
                    fs.unlinkSync(tmpLink);
                    stream.close();
                    reject(false);
                }
            })
            .catch(() => {
                fs.unlinkSync(tmpLink);
                stream.close();
                reject(false);
            });
    });
};

const rewritePKG = async (cwd: string = process.cwd()) => {
    const projectPkg = path.join(cwd, 'package.json');
    const projectPkgJSon = require(projectPkg);
    const projectDevDependencies = projectPkgJSon.devDependencies;
    delete projectDevDependencies['@react-native-community/eslint-config'];
    const postinstall = isArchiveRN(RNVersion)
        ? null
        : { postinstall: 'npx pod-install && npx jetify' };
    const newProjectPkgJSon = {
        ...projectPkgJSon,
        dependencies: {
            ...projectPkgJSon.dependencies,
            ...PKGList.dependencies,
        },
        devDependencies: {
            ...projectDevDependencies,
            ...PKGList.devDependencies,
        },
        scripts: {
            ...projectPkgJSon.scripts,
            ...postinstall,
        },
    };
    await writePkg(cwd, { ...newProjectPkgJSon });
    console.log(chalk.grey('rewrite package.json'));
};

const setupTemplate = async (cwd: string = process.cwd()) => {
    console.log(chalk.grey('Setup Template....'));
    const tmpLink = path.join(cwd, 'Archive.zip');
    const ArchivePath = fs.existsSync(tmpLink);
    if (!ArchivePath) {
        throw new CodeError(
            'NoTmpArchiveFound',
            'CLI download template file fail, please try again!',
        );
    }
    const outputPath = path.join(cwd, 'output');
    await extractZip(tmpLink, { dir: outputPath });
    fs.unlinkSync(tmpLink);
    const rnAppPath = fs.existsSync(path.join(cwd, 'App.js'));
    const eslintPath = fs.existsSync(path.join(cwd, '_eslintrc.js'));
    const eslintPath2 = fs.existsSync(path.join(cwd, '.eslintrc.js'));
    const prettierrcPath = fs.existsSync(path.join(cwd, '_prettierrc.js'));
    const prettierrcPath2 = fs.existsSync(path.join(cwd, '.prettierrc.js'));
    if (rnAppPath) {
        fs.unlinkSync(path.join(cwd, 'App.js'));
    }
    if (eslintPath) {
        fs.unlinkSync(path.join(cwd, '_eslintrc.js'));
    }
    if (eslintPath2) {
        fs.unlinkSync(path.join(cwd, '.eslintrc.js'));
    }
    if (prettierrcPath) {
        fs.unlinkSync(path.join(cwd, '_prettierrc.js'));
    }
    if (prettierrcPath2) {
        fs.unlinkSync(path.join(cwd, '.prettierrc.js'));
    }
    await mvdir(outputPath, cwd);
};

const installPackage = async (cwd: string = process.cwd()) => {
    const cmdOptipns = argv.verbose
        ? {
              stdio: 'inherit' as 'inherit',
          }
        : {};
    console.log(chalk.grey('Installing dependencies...'));
    const packageCmd = hasYarn(cwd) ? 'yarn' : 'npm';
    execSync(`${packageCmd} install`, cmdOptipns);
};

const setExit = (exitCode: CodeErrorType) => {
    if (!process.exitCode || process.exitCode === CodeErrors.Success) {
        console.log(chalk.greenBright('Install successful!'));
        process.exitCode = CodeErrors[exitCode];
    }
};

const setCustomPkg = (cwd: string, pkgpath: string) => {
    return new Promise((resolve, reject) => {
        if (!isRemote(pkgpath)) {
            const pkgJson = require(path.resolve(pkgpath));
            replacePKG(cwd, pkgJson).then(() => {
                resolve(true);
            });
        } else {
            const tmpPkgPath = path.join(cwd, '_package.json');
            const stream = fs.createWriteStream(tmpPkgPath);
            axios
                .get(pkgpath, { responseType: 'stream' })
                .then(({ status, data }) => {
                    if (status === 200) {
                        data.pipe(stream);
                        stream.on('finish', () => {
                            stream.close();
                            const pkgJson = require(path.resolve(tmpPkgPath));
                            replacePKG(cwd, pkgJson)
                                .then(() => {
                                    return resolve(true);
                                })
                                .catch(() => {
                                    return resolve(false);
                                });
                        });
                        stream.on('error', () => {
                            return resolve(false);
                        });
                    } else {
                        return resolve(false);
                    }
                })
                .catch(() => {
                    return resolve(false);
                });
        }
    });
};

const replacePKG = async (cwd: string = process.cwd(), pkgJson: any) => {
    console.log(chalk.grey('rewrite package.json'));
    const projectPkg = path.resolve(cwd, 'package.json');
    const projectPkgJSon = require(projectPkg);
    const projectDevDependencies = projectPkgJSon.devDependencies;
    const postinstall = isArchiveRN(RNVersion)
        ? null
        : { postinstall: 'npx pod-install && npx jetify' };
    const newProjectPkgJSon = {
        ...projectPkgJSon,
        dependencies: {
            ...projectPkgJSon.dependencies,
            ...pkgJson.dependencies,
        },
        devDependencies: {
            ...projectDevDependencies,
            ...pkgJson.devDependencies,
        },
        scripts: {
            ...projectPkgJSon.scripts,
            ...pkgJson.scripts,
            ...postinstall,
        },
    };
    await writePkg(cwd, { ...newProjectPkgJSon });
};

const crateTemplateDir = (cwd: string, pkgLink: string) => {
    if (isRemote(pkgLink)) {
        const tmpPkgPath = path.join(cwd, '_package.json');
        if (fs.existsSync(tmpPkgPath)) {
            fs.unlinkSync(tmpPkgPath);
        } else {
            throw new CodeError(
                'NoCustomPKGFound',
                'CLI download package json file fail, please try again!',
            );
        }
    }
    console.log(chalk.grey('create template dir'));
    const dirNameList = ['api', 'comm', 'language', 'router', 'screens', 'static', 'utils'];
    const srcPath = path.join(cwd, 'src');
    if (!fs.existsSync(srcPath)) {
        fs.mkdirSync(srcPath);
        dirNameList.forEach((element) => {
            const kPath = path.join(srcPath, element);
            if (!fs.existsSync(kPath)) {
                fs.mkdirSync(kPath);
            }
        });
    }
};

const isRemote = (path: string) => /^((https|http)?:\/\/)[^\s]+/.test(path);

const init = async () => {
    const isExistCmdPath = argv.path !== '' && argv.path.length > 0;
    const cwd = process.cwd();
    await getRNversion(cwd);
    if (!isExistCmdPath) {
        await rewritePKG(cwd);
        await dlTemplate(cwd);
        await setupTemplate(cwd);
        await installPackage(cwd);
    } else {
        await setCustomPkg(cwd, argv.path);
        crateTemplateDir(cwd, argv.path);
        await installPackage(cwd);
    }
    setExit('Success');
};

(async () => {
    try {
        await init();
    } catch (error) {
        const exitCode =
            error instanceof CodeError ? ((error as CodeError).name as CodeErrorType) : 'Unknown';
        if (exitCode !== 'Success') {
            console.error(chalk.red(error.message));
            // console.error(error);
        } else {
            setExit(exitCode);
        }
    }
})();
