import { Datastore } from '@google-cloud/datastore';
import { ErrorHelper } from './ErrorHelper';
import { loadModuleConfig } from './moduleConfig';

export class LumosDatastore {
  private static datastore: Datastore | undefined;
  private collectionName: string = 'Lumos';
  private projectId: string;

  constructor(forBrokerAccessTokens: boolean = false) {
    if (forBrokerAccessTokens) {
      this.projectId = process.env.BROKER_ACCESS_DATASTORE_PROJECT_ID || process.env.PROJECT_ID || '';
    } else {
      this.projectId = process.env.PROJECT_ID || '';
    }

    if (!this.projectId) {
      throw new Error(
        'PROJECT_ID environment variable must be set. ' +
        'This variable must be configured in the environment (for example, config/development.env or config/production.env).'
      );
    }

    if (!LumosDatastore.datastore) {
      LumosDatastore.datastore = new Datastore({
        projectId: this.projectId
      });
    }
  }

  async Get(settingName: string) {
    try {
      const settingKey = LumosDatastore.datastore!.key([this.collectionName, settingName]);
      const [setting] = await LumosDatastore.datastore!.get(settingKey);
      return setting;
    } catch (err) {
      ErrorHelper.LogErrorForGCP(
        err,
        `LumosDatastore.Get failed for setting "${settingName}" (may be a permission error). Ensure the running service account has roles/datastore.user on project ${this.projectId}.`
      );
      throw err;
    }
  }

  async Set(settingName: string, value: any) {
    try {
      const settingKey = LumosDatastore.datastore!.key([this.collectionName, settingName]);
      const data = (value !== null && typeof value === 'object') ? value : { value };
      await LumosDatastore.datastore!.save({ key: settingKey, data });
    } catch (err) {
      ErrorHelper.LogErrorForGCP(
        err,
        `LumosDatastore.Set failed for setting "${settingName}" (may be a permission error). Ensure the running service account has roles/datastore.user on project ${this.projectId}.`
      );
      throw err;
    }
  }
}
