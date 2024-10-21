export interface UnifiedApiResponse {
    payload?: Record<string, any>;
    error?: {
        action: string;
        errorCode?: string | number;
        errorMessage: string;
        extraErrorMessage: string;
    };
}

// Enums
export enum OperationMode {
    BEST_AVAILABLE = "BEST_AVAILABLE",
    FULL = "FULL"
}

export enum Modality {
    FACE = "FACE",
    LEFT_PALM = "LEFT_PALM",
    RIGHT_PALM = "RIGHT_PALM"
}

export enum FormFactorType {
    CARD = "CARD",
    QR = "QR",
    NONE = "NONE"
}

// Request Interfaces
export interface FetchInstanceIdRequest1053 {
    reliantAppGuid: string;
}

export interface SaveBiometricConsentRequest1031 {
    consentValue: number;
}

export interface RegisterBiometricUserRequest1051 {
    biometricConsentId: string;
    modality: Modality[];
    encrypt?: boolean;
    forcedModalityFlag?: boolean;
    operationMode: OperationMode;
}

export interface RegisterBasicUserRequest1005 {
    programGuid: string;
}

export interface ConsumerDeviceNumberRequest1008 {
    dummy?: number | null;
}

export interface CpUserProfileRequest1013 {
    passcode?: string;
    rId: string;
}

export interface RegistrationDataRequest1047 {
    dummy?: number | null;
}

export interface WriteProfileOnCardRequest1042 {
    rId: string;
    overwrite?: boolean;
}

export interface WritePasscodeOnCardRequest1043 {
    rId: string;
    passcode: string;
}

export interface VerifyPasscodeRequest1038 {
    passcode: string;
    formFactor: string;
    cpUserProfile?: string;
}

export interface VerifyUserRequest1048 {
    modality: string[];
    forcedModalityFlag?: boolean;
    formFactor: string;
}

export interface IdentifyBiometricsRequest1034 {
    modality: Modality[];
    forcedModalityFlag?: boolean;
    biometricConsentId: string;
    cacheHashesIfIdentified?: boolean;
}

export interface WriteProgramSpaceRequest1046 {
    rId: string;
    data: Record<string, any>; // Replaces JsonObject
}

export interface ReadProgramSpaceRequest1023 {
    rId: string;
}

export interface AddBiometricsRequest1001 {
    consentId: string;
    formFactor: string;
    modality: string[];
    rId: string;
}

export interface RegisterUserRequest1024 {
    modality: Modality[];
    forcedModalityFlag?: boolean;
    biometricConsentId: string;
}

export interface BioTokenGenerationDARequest1050 {
    reliantInstanceId: string;
    tag?: string;
    biometricConsentId: string;
    modality: Modality[];
    encrypt?: boolean;
}

// Response Interfaces
export interface FetchInstanceIdResponse1053 {
    instanceId: string;
    poiDeviceId: string;
    svaIntegrityKey: string;
}

export interface SaveBiometricConsentResponse1031 {
    responseStatus: number;
    message: string;
    consentId: string;
    errorCode: number;
}

export interface RegisterBiometricUserResponse1051 {
    rId: string;
    bioToken: string;
    enrolmentStatus: string;
}

export interface WriteProfileOnCardResponse1042 {
    consumerDeviceNumber: string;
}

export interface WritePasscodeOnCardResponse1043 {
    data: string;
}

export interface VerifyPasscodeResponse1038 {
    rId: string;
    status: boolean;
    authToken: string;
}

export interface VerifyUserResponse1048 {
    rId: string;
    status: boolean;
    authToken: string;
}

export interface IdentifyBiometricsResponse1034 {
    matchFound: boolean;
    relationshipId: string;
    matchList?: MatchList[];
}

export interface MatchList {
    modality: string;
    distance: number;
    normalizedScore: number;
}

export interface RegisterBasicUserResponse1005 {
    rId: string;
}

export interface RegistrationDataResponse1047 {
    rId: string;
    authMethods: AuthMethods;
    isRegisteredInProgram: boolean;
}

export interface AuthMethods {
    authType: string[];
    modalityType: string[];
}

export interface ConsumerDeviceNumberResponse1008 {
    consumerDeviceNumber: string;
}

export interface CpUserProfileResponse1013 {
    token: string;
    consumerDeviceNumber: string;
    message: string;
}


export interface WriteProgramSpaceResponse1046 {
    isSuccess: boolean;
}

export interface ReadProgramSpaceResponse1023 {
    data: string;
}

export interface RegisterUserResponse1024 {
    data: string;
}

export interface BioTokenGenerationDAResponse1050 {
    reliantInstanceId: string;
    tag?: string;
    biometricConsentId: string;
    modality: Modality[];
    encrypt?: boolean;
}

export interface ErrorResponse {
    errorCode: number;
    errorMessage: string;
    extraErrorMessage?: string;
}