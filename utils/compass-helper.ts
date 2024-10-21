import { WebIntent } from "@awesome-cordova-plugins/web-intent";
import { RegisterBasicUserResponse1005, RegisterBiometricUserResponse1051, RegistrationDataResponse1047, SaveBiometricConsentResponse1031, UnifiedApiResponse, WriteProfileOnCardResponse1042, WritePasscodeOnCardResponse1043, VerifyPasscodeResponse1038, VerifyUserResponse1048, IdentifyBiometricsResponse1034, ConsumerDeviceNumberResponse1008, WriteProgramSpaceResponse1046 } from './compass-helper.interfaces';


export class CompassHelperClass {

    private bridgeRAPackageName = '';
    private reliantAppGuid = '';
    private bridgeRAEncPublicKey = '';

    constructor(bridgeRAPackageName: string, reliantAppGuid: string) {
        if (!bridgeRAPackageName) throw new Error("bridgeRAPackageName is required");
        if (!reliantAppGuid) throw new Error("reliantAppGuid is required");
        this.bridgeRAPackageName = bridgeRAPackageName;
        this.reliantAppGuid = reliantAppGuid;
        this.bridgeRAEncPublicKey = window.localStorage.getItem('bridgeRAEncPublicKey') ?? '';
    }

    private prepareCMT(data: {
        participationProgramId: string,
        transactionTagId: string,
        status: string,
        payload: Record<string, any>
    }) {
        return {
            systemInfo: {
                "type": "Request"
            },
            commonAttributes: {
                clientAppDetails: {
                    reliantAppId: this.reliantAppGuid
                },
                serviceProvider: {
                    participationProgramId: data.participationProgramId
                },
                transaction: {
                    tagId: data.transactionTagId,
                    status: data.status
                }
            },
            custom: {
                ClientConstraint: [
                    "commonAttributes.transaction.tagId"
                ]
            },
            payload: {
                ...data.payload
            }
        };
    }

    private webIntentOptions(extras: {
        REQUEST_CODE: string,
        REQUEST_DATA: string
    }) {
        return {
            action: WebIntent.ACTION_SEND,
            component: {
                package: this.bridgeRAPackageName,
                class: "com.mastercard.compass.bridgera.CommunityPassUnifiedApi",
            },
            type: "text/plain",
            extras: extras,
        };
    }

    private async startIntentUsingLampaa(requestCode: string, requestData: string): Promise<[any, any]> {
        return new Promise(async (resolve, reject) => {
            try {
                const sApp = (window as any).startApp.set({
                    "action": "ACTION_SEND",
                    "package": this.bridgeRAPackageName,
                    "component": [this.bridgeRAPackageName, "com.mastercard.compass.bridgera.CommunityPassUnifiedApi"],
                    "intentstart": "startActivityForResult",
                }, {
                    REQUEST_CODE: requestCode,
                    REQUEST_DATA: requestData
                });

                sApp.start(function (compete: any) { // if receiver is registered
                    console.log("startIntentUsingLampaa compete: ", JSON.stringify(compete));
                }, function (error: any) {
                    console.log("startIntentUsingLampaa error: ", JSON.stringify(error));
                    resolve([null, error]);
                }, function (result: any, requestCode: any, resultCode: any) { // result message
                    console.log(result, requestCode, resultCode);

                    console.log("startIntentUsingLampaa result: ", JSON.stringify(result));

                    return resolve([{
                        extras: {
                            RESPONSE_DATA: result?.RESPONSE_DATA,
                            RESPONSE_ERROR: result?.RESPONSE_ERROR,
                            resultCode: resultCode,
                        }
                    }, null]);
                });
            } catch (err) {
                console.log(err)
                console.log("startIntentUsingLampaa error: ", JSON.stringify(err));
                resolve([null, err]);
            }
        });

    }

    private async startIntentUsingWebIntent(requestCode: string, requestData: string): Promise<[any, any]> {

        return new Promise(async (resolve, reject) => {
            try {

                const result = await WebIntent.startActivityForResult(this.webIntentOptions({
                    REQUEST_CODE: requestCode,
                    REQUEST_DATA: requestData
                })).then(
                    (res) => {
                        console.log('startIntentUsingWebIntent res', JSON.stringify(res))
                        if (res) {
                            return resolve([res, null]);
                        }
                    },
                    (err) => {
                        console.log('startIntentUsingWebIntent err', JSON.stringify(err))
                        resolve([null, err]);
                    }
                );

            } catch (err) {
                console.log(err)
                resolve([null, err]);
            }
        })

    }

    private async executeUnifiedApiRequest(requestCode: string, requestData: string): Promise<any> {
        const [result, cpError] = await this.startIntentUsingWebIntent(requestCode, requestData);

        console.log("intent result: ", JSON.stringify(result ?? ''), JSON.stringify(cpError ?? ''));

        if (!result) {
            return Promise.resolve({
                error: cpError,
            });
        }

        if (result?.extras.resultCode == -1) {
            const responseData: string = (result?.extras as any)?.RESPONSE_DATA;

            if (['1053'].includes(requestCode)) {
                const payload = JSON.parse(responseData)?.payload;
                return Promise.resolve({ payload });
            }

            const response = await (window as any).AndroidUtils.parseResponsePayload(responseData);
            const payload = JSON.parse(response?.responseData).payload;
            return Promise.resolve({ payload });
        } else {
            const responseError: string = (result?.extras as any)?.RESPONSE_ERROR;
            const payload = JSON.parse(responseError).payload;
            return Promise.resolve({
                error: {
                    action: payload?.action,
                    errorMessage: payload?.data?.errorMessage,
                    extraErrorMessage: payload?.data?.extraErrorMessage
                }
            });
        }
    }

    private async prepareRequest(cmt: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.bridgeRAEncPublicKey) throw new Error("bridgeRAEncPublicKey is empty");
                const result = await (window as any).AndroidUtils.prepareRequestPayload(cmt,
                    this.bridgeRAEncPublicKey);
                return resolve(result.requestData as string);
            } catch (err) {
                console.log(err)
                reject(err)
            }
        });
    }

    public async getInstanceId(programGuid: string) {
        try {
            let raPublicKey = window.localStorage.getItem("raPublicKey");
            if (!raPublicKey) {
                const response = await (window as any).AndroidUtils.generateRsaKeyPair();
                window.localStorage.setItem('raPublicKey', response?.publicKey ?? '');
                raPublicKey = response?.publicKey ?? '';
            }

            if (!raPublicKey) throw new Error('Falied to generate RSA Key Pair');

            const requestData = JSON.stringify(this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    reliantAppGuid: this.reliantAppGuid,
                    raPublicKey: raPublicKey,
                },
            }));

            const response = await this.executeUnifiedApiRequest('1053', requestData);

            if (!response?.payload?.data?.instanceId) {
                console.log("Failed to get instanceId");
                return null;
            }
            this.bridgeRAEncPublicKey = response.payload.data?.bridgeRAEncPublicKey;
            window.localStorage.setItem('instanceId', response.payload.data.instanceId);
            window.localStorage.setItem('bridgeRAEncPublicKey', response.payload.data?.bridgeRAEncPublicKey);
            window.localStorage.setItem('poiDeviceId', response.payload.data?.poiDeviceId);
            window.localStorage.setItem('svaIntegrityKey', response.payload.data?.svaIntegrityKey);

            return {
                instanceId: response.payload.data?.instanceId,
                poiDeviceId: response.payload.data?.poiDeviceId,
                svaIntegrityKey: response.payload.data?.svaIntegrityKey,
                bridgeRAEncPublicKey: response.payload.data?.bridgeRAEncPublicKey
            };
        } catch (err) {
            console.log(err);
            return null;
        }
    }

    public async saveBiometricsConsent(data: {
        granted: 1 | 0,
        programGuid: string,
        reliantAppGuid: string,
    }): Promise<UnifiedApiResponse & {
        payload?: {
            data: SaveBiometricConsentResponse1031
        }
    }> {
        try {
            const cmtObject = this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    reliantAppGuid: data.reliantAppGuid,
                    programGuid: data.programGuid,
                    consentValue: data.granted,
                },
            });

            const encryptedPayload = await this.prepareRequest(
                JSON.stringify(cmtObject)
            );

            if (!encryptedPayload) throw new Error("Failed to encrypt request payload");

            return await this.executeUnifiedApiRequest('1031', encryptedPayload);
        } catch (error: any) {
            return {
                error: {
                    action: '1031',
                    errorMessage: error.message,
                    extraErrorMessage: '',
                }
            };
        }
    }

    readRegistrationData = async (programGuid: string): Promise<UnifiedApiResponse & {
        payload?: {
            data: RegistrationDataResponse1047
        }
    }> => {
        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1047', encryptedPayload);

            console.log('readRegistrationData response: ', response, "\n");
            if (!response) throw new Error(response);

            return Promise.resolve(
                response as unknown as UnifiedApiResponse & {
                    payload?: {
                        data: RegistrationDataResponse1047
                    }
                }
            );

        } catch (error: any) {
            console.log('readRegistrationData error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1047',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }


    }

    createBasicDigitalId = async (programGuid: string): Promise<UnifiedApiResponse & {
        payload?: {
            data: RegisterBasicUserResponse1005
        }
    }> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: programGuid,
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1005', encryptedPayload);

            console.log('createBasicDigitalId response: ', response);

            return Promise.resolve(
                response as unknown as UnifiedApiResponse & {
                    payload?: {
                        data: RegisterBasicUserResponse1005
                    }
                }
            );

        } catch (error: any) {
            console.log('createBasicDigitalId error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1005',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    createBiometricDigitalId = async (
        data: {
            reliantAppGuid: string,
            programGuid: string,
            consentId: string,
            encrypt: boolean,
            forcedModalityFlag: boolean,
            operationMode: 'FULL' | 'BEST_AVAILABLE',
        }
    ): Promise<UnifiedApiResponse & {
        payload?: {
            data: RegisterBiometricUserResponse1051
        }
    }> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: data.programGuid,
                    consentId: data.consentId,
                    modality: ["FACE", "LEFT_PALM", "RIGHT_PALM"],
                    forcedModalityFlag: data.forcedModalityFlag,
                    encrypt: data.encrypt,
                    operationMode: data.operationMode,
                    reliantAppGuid: data.reliantAppGuid
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1051', encryptedPayload);
            console.log('createBiometricDigitalId: ', response);
            return Promise.resolve(
                response as unknown as UnifiedApiResponse & {
                    payload?: {
                        data: RegisterBiometricUserResponse1051
                    }
                }
            );

        } catch (error: any) {
            console.log('createBiometricDigitalId error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1051',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    writeDigitalIdonCard = async (programGuid: string, rId: string): Promise<UnifiedApiResponse & {
        payload?: {
            data: WriteProfileOnCardResponse1042
        }
    }> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: programGuid,
                    rId: rId,
                    overwrite: true
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1042', encryptedPayload);

            console.log(response);

            return Promise.resolve(
                response as unknown as UnifiedApiResponse & {
                    payload?: {
                        data: WriteProfileOnCardResponse1042
                    }
                }
            );
        } catch (error: any) {
            console.log('writeDigitalIdonCard error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1042',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    writePasscode = async (
        programGuid: string,
        rId: string,
        passcode: string
    ): Promise<UnifiedApiResponse & {
        payload?: {
            data: WritePasscodeOnCardResponse1043
        }
    }> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: programGuid,
                    rId: rId,
                    passcode: passcode
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);
            const response = await this.executeUnifiedApiRequest('1043', encryptedPayload);
            console.log('writePasscode: ', response);
            return Promise.resolve(
                response as unknown as UnifiedApiResponse & {
                    payload?: {
                        data: WritePasscodeOnCardResponse1043
                    }
                }
            );

        } catch (error: any) {
            console.log('writePasscode error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1043',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    verifyPasscode = async (
        programGuid: string,
        formFactor: string = 'CARD',
        passcode: string
    ): Promise<UnifiedApiResponse & {
        payload?: {
            data: VerifyPasscodeResponse1038
        }
    }> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: programGuid,
                    formFactor: formFactor,
                    passcode: passcode,
                    cpUserProfile: ''
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);
            const response = await this.executeUnifiedApiRequest('1038', encryptedPayload);
            console.log('verifyPasscode: ', response);
            return Promise.resolve(
                response as unknown as UnifiedApiResponse & {
                    payload?: {
                        data: VerifyPasscodeResponse1038
                    }
                }
            );
        } catch (error: any) {
            console.log('verifyPasscode error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1038',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    verifyBiometricDigitalId = async (
        data: {
            programGuid: string,
            reliantAppGuid: string,
            formFactor: string,
            forcedModalityFlag: boolean,
        }
    ): Promise<UnifiedApiResponse & {
        payload?: {
            data: VerifyUserResponse1048
        }
    }> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: data.programGuid,
                    formFactor: data.formFactor,
                    reliantAppGuid: data.reliantAppGuid,
                    forcedModalityFlag: data.forcedModalityFlag,
                    cpUserProfile: '',
                    modality: ["FACE", "LEFT_PALM", "RIGHT_PALM"],
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);
            const response = await this.executeUnifiedApiRequest('1048', encryptedPayload);
            console.log('verifyBiometricDigitalId: ', response);
            return Promise.resolve(
                response as unknown as UnifiedApiResponse & {
                    payload?: {
                        data: VerifyUserResponse1048
                    }
                }
            );

        } catch (error: any) {
            console.log('verifyBiometricDigitalId error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1048',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    addBiometricsToCpUserProfile = async (
        data: {
            programGuid: string,
            consentId: string,
            formFactor: string,
            rId: string
        }
    ): Promise<UnifiedApiResponse> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: data.programGuid,
                    consentId: data.consentId,
                    modality: ["FACE", "LEFT_PALM", "RIGHT_PALM"],
                    formFactor: data.formFactor,
                    rId: data.rId
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1001', encryptedPayload);

            console.log('addBiometricsToCpUserProfile: ', response);

            return response;

            return response;

        } catch (error: any) {
            console.log('addBiometricsToCpUserProfile error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1001',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    updateProfileOnCard = async (
        programGuid: string,
        rId: string
    ): Promise<UnifiedApiResponse> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: programGuid,
                    rId: rId
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1035', encryptedPayload);

            console.log('updateProfileOnCard response: ', response);

            return response;

        } catch (error: any) {
            console.log('updateProfileOnCard error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1035',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    IdentifyBiometricDigitalId = async (
        data: {
            programGuid: string,
            forcedModalityFlag: boolean,
            modality: ["FACE", "LEFT_PALM", "RIGHT_PALM"],
            cacheHashesIfIdentified: boolean,
            consentId: string
        }
    ): Promise<UnifiedApiResponse & {
        payload?: {
            data: IdentifyBiometricsResponse1034
        }
    }> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: data.programGuid,
                    modality: data.modality,
                    consentId: data.consentId,
                    cacheHashesIfIdentified: data.cacheHashesIfIdentified,
                    forcedModalityFlag: data.forcedModalityFlag
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1034', encryptedPayload);

            console.log("IdentifyBiometricDigitalId: ", response);

            return Promise.resolve(
                response as unknown as UnifiedApiResponse & {
                    payload?: {
                        data: IdentifyBiometricsResponse1034
                    }
                }
            );

        } catch (error: any) {
            console.log('IdentifyBiometricDigitalId error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1034',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }


    }

    verifyBiometicDigitalIdViaCard = async (
        programGuid: string,
        forcedModalityFlag = true,
        modality = ["FACE", "LEFT_PALM", "RIGHT_PALM"],
        formFactor: "CARD",
    ): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: programGuid,
                    modality: modality,
                    formFactor: formFactor,
                    forcedModalityFlag: forcedModalityFlag
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1048', encryptedPayload);

            console.log('verifyBiometicDigitalIdViaCard: ', response);

            return Promise.resolve(response as unknown as UnifiedApiResponse & {
                payload?: {
                    data: VerifyUserResponse1048
                }
            });

        } catch (error: any) {
            console.log('verifyBiometicDigitalIdViaCard error: ', error, "\n");
            return Promise.resolve({
                error: {
                    action: '1048',
                    errorMessage: error.message,
                    extraErrorMessage: '',
                }
            });
        }
    }

    verifyDigitalIdWithPasscodeViaCard = async (
        programGuid: string,
        passcode: string,
        formFactor = "CARD",
    ): Promise<UnifiedApiResponse & {
        payload?: {
            data: VerifyPasscodeResponse1038
        }
    }> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: programGuid,
                    passcode: passcode,
                    formFactor: formFactor,
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);
            const response = await this.executeUnifiedApiRequest('1038', encryptedPayload);
            console.log('verifyDigitalIdWithPasscodeViaCard: ', response);
            return Promise.resolve(
                response as unknown as UnifiedApiResponse & {
                    payload?: {
                        data: VerifyPasscodeResponse1038
                    }
                }
            );

        } catch (error: any) {
            console.log('verifyDigitalIdWithPasscodeViaCard error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1038',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    enrollNewUserInProgram = async (
        data: {
            programGuid: string,
            formFactor: string,
            authToken: string
        }
    ): Promise<UnifiedApiResponse> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programGuid: data.programGuid,
                    authToken: data.authToken,
                    formFactor: data.formFactor,
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1030', encryptedPayload);

            console.log(response);

            return response;

        } catch (error: any) {
            console.log('enrollNewUserInProgram error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1030',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    getConsumerDeviceNumber = async (
        programGuid: string,
    ): Promise<UnifiedApiResponse & {
        payload?: {
            data: ConsumerDeviceNumberResponse1008
        }
    }> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1008', encryptedPayload);

            console.log('getConsumerDeviceNumber response: ', response);

            return Promise.resolve(response as unknown as UnifiedApiResponse & {
                payload?: {
                    data: ConsumerDeviceNumberResponse1008
                }
            });

        } catch (error: any) {
            console.log('getConsumerDeviceNumber error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1008',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    getDataSchema = async (
        programGuid: string,
    ): Promise<UnifiedApiResponse> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1055', encryptedPayload);

            console.log('getDataSchema response: ', response);

            return response;

        } catch (error: any) {
            console.log('getDataSchema error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1055',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    exchangeProgramSpaceKeys = async (
        data: {
            programGuid: string,
            reliantAppInstanceId: string,
            reliantAppGuid: string,
            clientPublicKey: string
        }
    ): Promise<UnifiedApiResponse> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    reliantAppInstanceId: data.reliantAppInstanceId,
                    programGuid: data.programGuid,
                    reliantAppGuid: data.reliantAppGuid,
                    clientPublicKey: data.clientPublicKey,
                    type: 'PROGRAM_SPACE',
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            console.log("exchangeProgramSpaceKeys cmt: ", cmt);



            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1052', encryptedPayload);

            console.log('exchangeProgramSpaceKeys: ', response);

            return response;

        } catch (error: any) {
            console.log('1052 error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1052',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    prepareProgramSpace = async (
        data: {
            programGuid: string,
            schema: string,
            programSpaceData: string,
        }
    ): Promise<UnifiedApiResponse> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    programSpaceData: data.programSpaceData,
                    schema: data.schema
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('3000', encryptedPayload);

            console.log('prepareProgramSpace response: ', response);

            return response;

        } catch (error: any) {
            console.log('prepareProgramSpace error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '3000',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    writeToProgramSpace = async (
        data: {
            programGuid: string,
            rId: string,
            data: string,
        }
    ): Promise<UnifiedApiResponse & {
        payload?: {
            data: WriteProgramSpaceResponse1046
        }
    }> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    rId: data.rId,
                    programGuid: data.programGuid,
                    data: data.data,
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            console.log("writeToProgramSpace CMT:", cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1046', encryptedPayload);

            console.log("writeToProgramSpace CMT:", cmtObject);
            console.log("writeToProgramSpace response:", response);

            return Promise.resolve(
                response as unknown as UnifiedApiResponse & {
                    payload?: {
                        data: WriteProgramSpaceResponse1046
                    }
                }
            );
        } catch (error: any) {
            console.log('writeToProgramSpace error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1046',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    writeDataRecordToCard = async (
        data: {
            programGuid: string,
            rId: string,
            reliantAppGuid: string,
            appDataRecord: {
                index: number,
                chunk: string
            }[],
        }
    ): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    rId: data.rId,
                    reliantAppGuid: data.reliantAppGuid,
                    appDataRecord: data.appDataRecord,
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1045', encryptedPayload);

            console.log("writeDataRecordToCard CMT:", cmtObject);
            console.log("writeDataRecordToCard response:", response);

            return response;

        } catch (error: any) {
            console.log('writeDataRecordToCard error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1045',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }

    }

    readDataRecordFromCard = async (
        data: {
            programGuid: string,
            rId: string,
            reliantAppGuid: string,
            indexes: number[],
        }
    ): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    rId: data.rId,
                    reliantAppGuid: data.reliantAppGuid,
                    indexes: data.indexes,
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1026', encryptedPayload);

            return response;

        } catch (error: any) {
            console.log('readDataRecordFromCard error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1026',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    writeDataBlobToCard = async (
        data: {
            programGuid: string,
            rId: string,
            reliantAppGuid: string,
            appDataBlock: string,
            isShared: boolean,
        }
    ): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    rId: data.rId,
                    reliantAppGuid: data.reliantAppGuid,
                    appDataBlock: data.appDataBlock,
                    isShared: data.isShared,
                    programGuid: data.programGuid
                },
            }));

            const cmt = JSON.stringify(cmtObject);


            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1044', encryptedPayload);

            return response;

        } catch (error: any) {
            console.log('writeDataBlobToCard error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1044',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }


    }
    readDataBlobFromCard = async (
        data: {
            programGuid: string,
            rId: string,
            reliantAppGuid: string,
            isShared: boolean,
        }
    ): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    rId: data.rId,
                    reliantAppGuid: data.reliantAppGuid,
                    isShared: data.isShared,
                    programGuid: data.programGuid
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1019', encryptedPayload);

            return response;

        } catch (error: any) {
            console.log('readDataBlobFromCard error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1019',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }


    }

    createSva = async (
        data: {
            programGuid: string,
            rId: string,
            reliantAppGuid: string,
            svaData: {
                purseSubType: 'POINT' | 'COMMODITY' | 'FINANCIAL',
                svaUnit: string,
            },
            isProgramSpace: boolean,
        }
    ): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    rId: data.rId,
                    //reliantAppGuid: data.reliantAppGuid,
                    //programGuid: data.programGuid,
                    svaData: data.svaData,
                    isProgramSpace: data.isProgramSpace,
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            console.log('createSva cmt: ', cmt, "\n");


            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1011', encryptedPayload);

            return response;

        } catch (error: any) {
            console.log('createSva error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1011',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    readSva = async (
        data: {
            programGuid: string,
            rId: string,
            reliantAppGuid: string,
            svaUnit: string,
            isProgramSpace: boolean,
        }
    ): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    rId: data.rId,
                    svaUnit: data.svaUnit,
                    isProgramSpace: data.isProgramSpace,
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            console.log('readSva cmt: ', cmt, "\n");

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1020', encryptedPayload);

            return response;

        } catch (error: any) {
            console.log('readSva error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1020',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    readAllSvas = async (
        data: {
            programGuid: string,
            rId: string,
            reliantAppGuid: string,
            isProgramSpace: boolean,
        }
    ): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    rId: data.rId,
                    isProgramSpace: data.isProgramSpace,
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            console.log('readAllSvas cmt: ', cmt, "\n");

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1033', encryptedPayload);

            return response;

        } catch (error: any) {
            console.log('readAllSvas error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1033',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    mutateSva = async (
        data: {
            programGuid: string,
            rId: string,
            reliantAppGuid: string,
            isProgramSpace: boolean,
            svaOperation: {
                svaUnit: string,
                amount: number,
                operationType: 'INCREASE' | 'DECREASE' | 'UPDATE',
            }
        }
    ): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    rId: data.rId,
                    isProgramSpace: data.isProgramSpace,
                    svaOperation: data.svaOperation,
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            console.log('readAllSvas cmt: ', cmt, "\n");

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1032', encryptedPayload);

            return response;

        } catch (error: any) {
            console.log('readAllSvas error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1032',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    batchOperation = async (
        data: {
            programGuid: string,
            shouldContinueOnError: boolean
            operations: {
                actions: string | number;
                payload: any
            }[],
            reliantAppInstanceId: string,

        }
    ): Promise<UnifiedApiResponse> => {
        try {
            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                    operations: data.operations,
                    shouldContinueOnError: data.shouldContinueOnError,
                    reliantAppInstanceId: data.reliantAppInstanceId,
                    programGuid: data.programGuid,

                },
            }));

            const cmt = JSON.stringify(cmtObject);

            console.log('batchOperation cmt: ', cmt, "\n");

            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1003', encryptedPayload);

            return response;

        } catch (error: any) {
            console.log('batchOperation error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1003',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    startDataSync = async (data: {
        programGuid: string;

    }): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            console.log('startDataSync cmt: ', cmt, "\n");


            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1057', encryptedPayload);

            return response;

        } catch (error: any) {
            console.log('startDataSync error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1057',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }

    getDataSyncWorkerStatus = async (data: {
        programGuid: string;
    }): Promise<UnifiedApiResponse> => {

        try {

            const cmtObject = (this.prepareCMT({
                participationProgramId: data.programGuid,
                transactionTagId: 'BridgeRA',
                status: 'Testing',
                payload: {
                },
            }));

            const cmt = JSON.stringify(cmtObject);

            console.log('getDataSyncWorkerStatus cmt: ', cmt, "\n");



            const encryptedPayload = await this.prepareRequest(cmt);

            const response = await this.executeUnifiedApiRequest('1056', encryptedPayload);

            return response;

        } catch (error: any) {
            console.log('getDataSyncWorkerStatus error: ', error, "\n");
            return Promise.resolve(
                {
                    error: {
                        action: '1056',
                        errorMessage: error.message,
                        extraErrorMessage: '',
                    }
                }
            );
        }
    }


}
