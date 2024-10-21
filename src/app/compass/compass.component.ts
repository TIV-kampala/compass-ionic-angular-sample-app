import { Component, Input, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxJsonViewerModule } from 'ngx-json-viewer';
import { CompassHelperClass } from '../../../utils/compass-helper';
import { ACCEPTOR_PROGRAM_GUID, CREDENTIAL_PROGRAM_GUID, PACKAGE_NAME, RELIANT_APP_GUID } from 'env';
import { CommonModule } from '@angular/common';
import { Buffer } from 'buffer';

interface State {
  instanceId: string;
  cmGetInstanceIdResponse?: any;
  accGetInstanceIdResponse?: any;
  readRegistrationDataResponse?: any;
  bridgeRAEncPublicKey?: string;
  rId?: string;
  [key: string]: any;
}

interface Action {
  label: string;
  value: string;
  execute: () => Promise<void>;
}

@Component({
  selector: 'app-compass-component',
  imports: [
    NgxJsonViewerModule,
    CommonModule,
    FormsModule
  ],
  templateUrl: './compass.component.html',
  // styleUrls: ['./compass.component.scss'],
  standalone: true,
})
export class CompassComponent implements OnInit {
  state: State = {
    instanceId: ''
  };
  isLoading = false;
  selectedAction = '';
  isFocused = false;
  consentId = '';
  rId = '';
  consumerDeviceNumber = '';
  authToken = '';
  programSpaceSchema = '';

  private compassHelper: CompassHelperClass;
  private previousBridgeRAEncPublicKey: string | undefined;

  constructor() {
    this.compassHelper = new CompassHelperClass(
      PACKAGE_NAME,
      RELIANT_APP_GUID
    );
  }

  ngOnInit(): void {
    // Initialize state from localStorage if needed
    const storedInstanceId = localStorage.getItem('instanceId');
    const storedRId = localStorage.getItem('rId');
    const storedBridgeRAEncPublicKey = localStorage.getItem('bridgeRAEncPublicKey');

    this.state = {
      ...this.state,
      instanceId: storedInstanceId || '',
      rId: storedRId || '',
      bridgeRAEncPublicKey: storedBridgeRAEncPublicKey || ''
    };

    this.previousBridgeRAEncPublicKey = this.state.bridgeRAEncPublicKey;
  }

  setState(state: State): void {
    this.state = state;
  }

  async executeAction(): Promise<void> {
    if (this.selectedAction) {
      const action = this.actions.find(item => item.value === this.selectedAction);
      if (action) {
        await action.execute();
      }
    }
  }

  actions: Action[] = [
    {
      label: 'Get Instance ID - CM',
      value: 'getInsatnceIdCM',
      execute: async () => {
        this.isLoading = true;
        try {
          const res = await this.compassHelper.getInstanceId(CREDENTIAL_PROGRAM_GUID);
          this.state = {
            ...this.state,
            cmGetInstanceIdResponse: res,
            instanceId: res?.instanceId,
            bridgeRAEncPublicKey: res?.bridgeRAEncPublicKey
          };
        } catch (err) {
          this.state = { ...this.state, cmGetInstanceIdResponse: err };
        } finally {
          this.isLoading = false;
        }
      }
    },
    {
      label: 'Get Instance ID - Acceptor',
      value: 'getInsatnceIdAcceptor',
      execute: async () => {
        this.isLoading = true;
        try {
          const res = await this.compassHelper.getInstanceId(ACCEPTOR_PROGRAM_GUID);
          this.state = {
            ...this.state,
            accGetInstanceIdResponse: res,
            instanceId: res?.instanceId
          };
        } catch (err) {
          this.state = { ...this.state, accGetInstanceIdResponse: err };
        } finally {
          this.isLoading = false;
        }
      }
    }
  ];

  ngDoCheck() {
    if (this.state.bridgeRAEncPublicKey) {

      this.actions.push(
        {
          label: "Biometrics consent - CM",
          value: "saveBiometricsConsent",
          execute: async () => {
            this.isLoading = true;
            this.compassHelper
              .saveBiometricsConsent({
                granted: 1,
                programGuid: CREDENTIAL_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
              })
              .then((res) => {
                this.setState({
                  ...this.state,
                  saveBiometricsResponse: res,
                  consentId: res?.payload?.data?.consentId,
                });
                if (res?.payload?.data?.consentId) {
                  this.consentId = res?.payload?.data?.consentId;
                }
              })
              .catch((err) => {
                this.setState({ ...this.state, saveBiometricsResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Read Registration Data - CM",
          value: "readRegistrationDataCM",
          execute: async () => {
            this.isLoading = true;
            this.compassHelper
              .readRegistrationData(CREDENTIAL_PROGRAM_GUID)
              .then((res) => {
                this.setState({
                  ...this.state,
                  readRegistrationDataCMResponse: res,
                  cmRID: res?.payload?.data?.rId,
                });
              })
              .catch((err) => {
                this.setState({ ...this.state, readRegistrationDataCMResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Read Registration Data - Acceptor",
          value: "readRegistrationDataAcceptor",
          execute: async () => {
            this.isLoading = true;
            this.compassHelper
              .readRegistrationData(ACCEPTOR_PROGRAM_GUID)
              .then((res) => {
                this.setState({
                  ...this.state,
                  readRegistrationDataAcceptorResponse: res,
                  accRID: res?.payload?.data?.rId,
                });
              })
              .catch((err) => {
                this.setState({ ...this.state, readRegistrationDataCMResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Create Basic D-ID",
          value: "createBasicDigitalId",
          execute: async () => {
            this.isLoading = true;
            const createBasicDigitalIdResponse = await this.compassHelper
              .createBasicDigitalId(CREDENTIAL_PROGRAM_GUID)
              .finally(() => this.isLoading = false);
            this.setState({
              ...this.state,
              createBasicDigitalIdResponse: createBasicDigitalIdResponse,
              rId: createBasicDigitalIdResponse?.payload?.data?.rId,
            });
            const rID = createBasicDigitalIdResponse?.payload?.data?.rId;
            if (rID) {
              window.localStorage.setItem(
                "rId",
                createBasicDigitalIdResponse?.payload?.data?.rId ?? ""
              );
              this.rId = createBasicDigitalIdResponse?.payload?.data?.rId ?? "";
            }
          },
        },
        {
          label: "Create Biometric D-ID",
          value: "createBiometricDigitalId",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .createBiometricDigitalId({
                consentId: this.consentId,
                encrypt: true,
                forcedModalityFlag: true,
                operationMode: "FULL",
                programGuid: CREDENTIAL_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
              })
              .then((res) => {
                this.setState({ ...this.state, createBiometricDigitalIdResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, createBiometricDigitalIdResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Identify Biometric D-ID",
          value: "IdentifyBiometricDigitalId",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .IdentifyBiometricDigitalId({
                consentId: this.consentId,
                forcedModalityFlag: true,
                cacheHashesIfIdentified: true,
                modality: ["FACE", "LEFT_PALM", "RIGHT_PALM"],
                programGuid: CREDENTIAL_PROGRAM_GUID,
              })
              .then((res) => {
                this.setState({ ...this.state, IdentifyBiometricDigitalIdResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, IdentifyBiometricDigitalIdResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Write  D-ID",
          value: "writeDigitalId",
          execute: async () => {
            this.isLoading = true;
            const writeDigitalIdResponse = await this.compassHelper
              .writeDigitalIdonCard(CREDENTIAL_PROGRAM_GUID, this.rId)
              .finally(() => this.isLoading = false);
            this.setState({
              ...this.state,
              writeDigitalIdResponse: writeDigitalIdResponse,
            });
            const consumerDeviceNumber =
              writeDigitalIdResponse?.payload?.data?.consumerDeviceNumber;
            if (consumerDeviceNumber) {
              window.localStorage.setItem(
                "consumerDeviceNumber",
                writeDigitalIdResponse?.payload?.data?.consumerDeviceNumber ?? ""
              );
              this.consumerDeviceNumber = writeDigitalIdResponse?.payload?.data?.consumerDeviceNumber ?? "";

            }
          },
        },
        {
          label: "Write Passcode",
          value: "writePasscode",
          execute: async () => {
            this.isLoading = true;
            const writePasscodeResponse = await this.compassHelper
              .writePasscode(CREDENTIAL_PROGRAM_GUID, this.rId, "123456")
              .finally(() => this.isLoading = false);
            this.setState({
              ...this.state,
              writePasscodeResponse: writePasscodeResponse,
            });
          },
        },
        {
          label: "Add Biometrics to CP User Profile",
          value: "addBiometricsToCpUserProfile",
          execute: async () => {
            this.isLoading = true;
            this.compassHelper
              .addBiometricsToCpUserProfile({
                consentId: this.consentId,
                formFactor: "CARD",
                programGuid: CREDENTIAL_PROGRAM_GUID,
                rId: this.rId,
              })
              .then((res) => {
                this.setState({ ...this.state, addBiometricsToCpUserProfileResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, addBiometricsToCpUserProfileResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Verify Passcode - CM",
          value: "verifyPasscodeCredentialManager",
          execute: async () => {
            this.isLoading = true;
            const verifyPasscode = await this.compassHelper
              .verifyPasscode(CREDENTIAL_PROGRAM_GUID, "CARD", "123456")
              .finally(() => this.isLoading = false);
            if (verifyPasscode?.payload?.data?.authToken) {
              this.authToken = verifyPasscode?.payload?.data?.authToken;
            }

            this.setState({
              ...this.state,
              verifyPasscode: verifyPasscode,
              authToken: verifyPasscode?.payload?.data?.authToken,
            });
          },
        },
        {
          label: "Verify Passcode - Acceptor",
          value: "verifyPasscodeAcceptor",
          execute: async () => {
            this.isLoading = true;
            const verifyPasscode = await this.compassHelper
              .verifyPasscode(ACCEPTOR_PROGRAM_GUID, "CARD", "123456")
              .finally(() => this.isLoading = false);
            if (verifyPasscode?.payload?.data?.authToken) {
              this.authToken = verifyPasscode?.payload?.data?.authToken;
            }

            this.setState({
              ...this.state,
              verifyPasscode: verifyPasscode,
              authToken: verifyPasscode?.payload?.data?.authToken,
            });
          },
        },
        {
          label: "Enroll new user in Acceptor Program",
          value: "EnrollUserToProgram",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .enrollNewUserInProgram({
                authToken: this.authToken,
                formFactor: "CARD",
                programGuid: ACCEPTOR_PROGRAM_GUID,
              })
              .then((res) => {
                this.setState({ ...this.state, enrollProgramResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, enrollProgramResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Read Consumer Device Number",
          value: "getConsumerDeviceNumber",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .getConsumerDeviceNumber(CREDENTIAL_PROGRAM_GUID)
              .then((res) => {
                this.setState({ ...this.state, getConsumerDeviceNumberResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, getConsumerDeviceNumberResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Get Data Schema",
          value: "getDataSchema",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .getDataSchema(ACCEPTOR_PROGRAM_GUID)
              .then((res) => {
                this.setState({
                  ...this.state,
                  getDataSchemaResponse: res,
                  programSpaceSchema: res?.payload?.['data']?.schemaJson,
                });
                this.programSpaceSchema = res?.payload?.['data']?.schemaJson;
              })
              .catch((err) => {
                this.setState({ ...this.state, getDataSchemaResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },

        {
          label: "Prepare Program Space - Acceptor",
          value: "prepareProgramSpace",
          execute: async () => {
            this.isLoading = true;
            console.log("programSpaceSchema", this.programSpaceSchema);
            await this.compassHelper
              .prepareProgramSpace({
                schema: this.programSpaceSchema,
                programGuid: ACCEPTOR_PROGRAM_GUID,
                programSpaceData: JSON.stringify({
                  id: 1000000001,
                  name: "Eric Kalujja",
                  voucherBalance: 0,
                }),
              })
              .then((res) => {
                this.setState({ ...this.state, prepareProgramSpaceResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, prepareProgramSpaceResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Write To Program Space - Acceptor",
          value: "writeToProgramSpace",
          execute: async () => {
            this.isLoading = true;
            console.log(
              this.state?.['prepareProgramSpaceResponse']?.payload?.data?.output
            );
            await this.compassHelper
              .writeToProgramSpace({
                data: this.state?.['prepareProgramSpaceResponse']?.payload?.data?.output,
                programGuid: ACCEPTOR_PROGRAM_GUID,
                rId: this.state?.['accRID'],
              })
              .then((res) => {
                this.setState({ ...this.state, writeToProgramSpaceResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, writeToProgramSpaceResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Write Data Record to Card",
          value: "writeDataRecordToCard",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .writeDataRecordToCard({
                appDataRecord: [
                  {
                    index: 0,
                    chunk: Buffer.from("Test Data").toString("base64"),
                  },
                  {
                    index: 1,
                    chunk: Buffer.from("Test Data 2").toString("base64"),
                  },
                ],
                programGuid: ACCEPTOR_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
                rId: this.state?.['accRID'],
              })
              .then((res) => {
                this.setState({ ...this.state, writeDataRecordToCardResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, writeDataRecordToCardResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Read Data Record from Card",
          value: "readDataRecordFromCard",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .readDataRecordFromCard({
                indexes: [0, 1],
                programGuid: ACCEPTOR_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
                rId: this.state?.['accRID'],
              })
              .then((res) => {
                this.setState({ ...this.state, readDataRecordFromCardResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, readDataRecordFromCardResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Write Data Blob to Card",
          value: "writeDataBlobToCard",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .writeDataBlobToCard({
                isShared: true,
                appDataBlock: Buffer.from("Test Data Blob").toString("base64"),
                programGuid: ACCEPTOR_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
                rId: this.state?.['accRID'],
              })
              .then((res) => {
                this.setState({ ...this.state, writeDataBlobToCardResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, writeDataBlobToCardResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Read Data Blob from Card",
          value: "readDataBlobFromCard",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .readDataBlobFromCard({
                isShared: true,
                programGuid: ACCEPTOR_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
                rId: this.state?.['accRID'],
              })
              .then((res) => {
                this.setState({ ...this.state, readDataBlobFromCardResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, readDataBlobFromCardResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Create SVA",
          value: "createSva",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .createSva({
                isProgramSpace: false,
                programGuid: ACCEPTOR_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
                rId: this.state?.['accRID'],
                svaData: {
                  purseSubType: "POINT",
                  svaUnit: "bl",
                },
              })
              .then((res) => {
                this.setState({ ...this.state, createSvaResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, createSvaResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },

        {
          label: "Read SVA",
          value: "readSva",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .readSva({
                isProgramSpace: false,
                programGuid: ACCEPTOR_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
                rId: this.state?.['accRID'],
                svaUnit: "bl",
              })
              .then((res) => {
                this.setState({ ...this.state, readSvaResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, readSvaResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Read All SVAs",
          value: "readAllSvas",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .readAllSvas({
                isProgramSpace: false,
                programGuid: ACCEPTOR_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
                rId: this.state?.['accRID'],
              })
              .then((res) => {
                this.setState({ ...this.state, readAllSvasResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, readAllSvasResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "INCREASE SVA",
          value: "mutateSva",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .mutateSva({
                isProgramSpace: false,
                programGuid: ACCEPTOR_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
                rId: this.state?.['accRID'],
                svaOperation: {
                  amount: 100,
                  operationType: "INCREASE",
                  svaUnit: "bl",
                },
              })
              .then((res) => {
                this.setState({ ...this.state, mutateSvaResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, mutateSvaResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },

        {
          label: "Verify Biometrics",
          value: "verifyBiometricDigitalId",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .verifyBiometricDigitalId({
                forcedModalityFlag: true,
                formFactor: "CARD",
                programGuid: ACCEPTOR_PROGRAM_GUID,
                reliantAppGuid: RELIANT_APP_GUID,
              })
              .then((res) => {
                this.setState({ ...this.state, verifyBiometricDigitalIdResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, verifyBiometricDigitalIdResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Batch Operation - CM",
          value: "batchOperation",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .batchOperation({
                shouldContinueOnError: false,
                reliantAppInstanceId:
                  window.localStorage.getItem("instanceId") ?? "",
                programGuid: CREDENTIAL_PROGRAM_GUID,
                operations: [
                  {
                    actions: "1038",
                    payload: {
                      passcode: "123456",
                      formFactor: "CARD",
                      participationProgramId: CREDENTIAL_PROGRAM_GUID,
                    },
                  },
                  {
                    actions: "1033",
                    payload: {
                      rId: this.state?.['accRID'],
                      isProgramSpace: false,
                      participationProgramId: CREDENTIAL_PROGRAM_GUID,
                    },
                  },
                ],
              })
              .then((res) => {
                this.setState({ ...this.state, batchOperationResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, batchOperationResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Start Data Sync",
          value: "startDataSync",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .startDataSync({
                programGuid: CREDENTIAL_PROGRAM_GUID,
              })
              .then((res) => {
                this.setState({ ...this.state, startDataSyncResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, startDataSyncResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Get Data Sync Worker Status",
          value: "getDataSyncWorkerStatus",
          execute: async () => {
            this.isLoading = true;
            await this.compassHelper
              .getDataSyncWorkerStatus({
                programGuid: CREDENTIAL_PROGRAM_GUID,
              })
              .then((res) => {
                this.setState({ ...this.state, getDataSyncWorkerStatusResponse: res });
              })
              .catch((err) => {
                this.setState({ ...this.state, getDataSyncWorkerStatusResponse: err });
              })
              .finally(() => this.isLoading = false);
          },
        },
        {
          label: "Clear App State",
          value: "clearAppState",
          execute: async () => {
            this.isLoading = true;
            this.state = {
              instanceId: "",
            };
            this.rId = "";
            this.consumerDeviceNumber = "";
            this.programSpaceSchema = "";
            this.authToken = "";
            window.localStorage.clear();
            this.isLoading = false;
          },
        }
      );

    }
  }


}
