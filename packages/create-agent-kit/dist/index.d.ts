type RunLogger = {
    log: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
};
type PromptChoice = {
    value: string;
    title: string;
    description?: string;
};
type PromptApi = {
    select: (params: {
        message: string;
        choices: PromptChoice[];
    }) => Promise<string>;
    confirm: (params: {
        message: string;
        defaultValue?: boolean;
    }) => Promise<boolean>;
    input: (params: {
        message: string;
        defaultValue?: string;
    }) => Promise<string>;
    close?: () => Promise<void> | void;
};
type RunOptions = {
    cwd?: string;
    templateRoot?: string;
    logger?: RunLogger;
    prompt?: PromptApi;
};
declare function runCli(argv: string[], options?: RunOptions): Promise<void>;

export { type PromptApi, type RunLogger, runCli };
