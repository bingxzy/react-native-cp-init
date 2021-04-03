export const CodeErrors = {
    Success: 0,
    NoPackageJSon: 1,
    NoReactNativeFound: 3,
    Autolinking: 4,
    NoTmpArchiveFound: 5,
    Unknown: -1,
};

export type CodeErrorType = keyof typeof CodeErrors;

export class CodeError extends Error {
    constructor(type: CodeErrorType, message: string, public readonly data?: Record<string, any>) {
        super(message);
        this.name = type;
    }
}
