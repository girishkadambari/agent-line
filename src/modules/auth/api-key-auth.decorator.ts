import { SetMetadata } from '@nestjs/common';

export const allowApiKeyAuthMetadataKey = 'allowApiKeyAuth';

export const AllowApiKeyAuth = () => SetMetadata(allowApiKeyAuthMetadataKey, true);
