import chalk from 'chalk';
import hasYarn from 'has-yarn';
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

// const tmpLink =  + '/Archive.zip';

const getRNversion = async (cwd: string) => {
    try {
        const rnPkgJsonPath = require.resolve('react-native/package.json', {
            paths: [cwd],
        });
        const { version } = require(rnPkgJsonPath);
        console.log(chalk.grey('react-native version is ' + version));
        return version;
    } catch (error) {
        throw new CodeError(
            'NoReactNativeFound',
            'Must be run from a project that already depends on react-native, and has react-native installed.',
        );
    }
};

const dlTemplate = async (cwd: string) => {
    console.log(chalk.grey('Downloading Template'));
    const tmpLink = cwd + '/Archive.zip';
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

const rewritePKG = async (cwd: string) => {
    const projectPkg = path.resolve(cwd, 'package.json');
    const projectPkgJSon = require(projectPkg);
    const projectDevDependencies = projectPkgJSon.devDependencies;
    delete projectDevDependencies['@react-native-community/eslint-config'];
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
            postinstall: 'npx pod-install && npx jetify',
        },
    };
    await writePkg(cwd, { ...newProjectPkgJSon });
    console.log(chalk.grey('rewrite package.json'));
};

const setupTemplate = async (cwd: string) => {
    console.log(chalk.grey('Setup Template....'));
    const tmpLink = cwd + '/Archive.zip';
    const ArchivePath = fs.existsSync(tmpLink);
    if (!ArchivePath) {
        throw new CodeError(
            'NoTmpArchiveFound',
            'CLI download template file fail, please try again!',
        );
    }
    const outputPath = cwd + '/output';
    await extractZip(tmpLink, { dir: outputPath });
    fs.unlinkSync(tmpLink);
    const rnAppPath = fs.existsSync(cwd + '/App.js');
    const eslintPath = fs.existsSync(cwd + '/_eslintrc.js');
    const eslintPath2 = fs.existsSync(cwd + '/.eslintrc.js');
    const prettierrcPath = fs.existsSync(cwd + '/_prettierrc.js');
    const prettierrcPath2 = fs.existsSync(cwd + '/.prettierrc.js');
    if (rnAppPath) {
        fs.unlinkSync(cwd + '/App.js');
    }
    if (eslintPath) {
        fs.unlinkSync(cwd + '/_eslintrc.js');
    }
    if (eslintPath2) {
        fs.unlinkSync(cwd + '/.eslintrc.js');
    }
    if (prettierrcPath) {
        fs.unlinkSync(cwd + '/_prettierrc.js');
    }
    if (prettierrcPath2) {
        fs.unlinkSync(cwd + '/.prettierrc.js');
    }
    await mvdir(outputPath, cwd);
};

const installPackage = async (cwd: string) => {
    console.log(chalk.grey('Installing dependencies...'));
    const packageCmd = hasYarn(cwd) ? 'yarn' : 'npm';
    execSync(`${packageCmd} install`);
};

const setExit = (exitCode: CodeErrorType) => {
    if (!process.exitCode || process.exitCode === CodeErrors.Success) {
        console.log(chalk.greenBright('Install successful!'));
        process.exitCode = CodeErrors[exitCode];
    }
};

const init = async () => {
    const cwd = process.cwd();
    await getRNversion(cwd);
    await rewritePKG(cwd);
    await dlTemplate(cwd);
    await setupTemplate(cwd);
    await installPackage(cwd);
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
