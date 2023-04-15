
const { Contract } = require('fabric-contract-api');

class UserProfile {
    constructor(userId, ethereumAddress) {
        this.userId = userId;
        this.ethereumAddress = ethereumAddress;
        this.type = 'UserProfile';
    }
}

class KycChaincode extends Contract {

    async initLedger(ctx) {
        console.info('Initializing the ledger');
    }

    async submitKycData(ctx, customerId, encryptedKycData) {
        await ctx.stub.putPrivateData('customerPrivateData', customerId, Buffer.from(encryptedKycData));
    }

    async getKycData(ctx, customerId, financialInstitution, peerMSPID) {
        if (!this._isFinancialInstitution(financialInstitution, peerMSPID)) {
            throw new Error('Access denied: Only designated financial institutions can access KYC data');
        }

        const privateDataBuffer = await ctx.stub.getPrivateData('customerPrivateData', customerId);
        if (!privateDataBuffer || privateDataBuffer.length === 0) {
            throw new Error(`No KYC data found for customer: ${customerId}`);
        }

        const encryptedData = privateDataBuffer.toString('utf-8');
        return encryptedData;
    }

    async requestValidation(ctx, walletAddress, designatedBank) {
        const validationRequest = {
            status: 'pending',
            designatedBank: designatedBank,
            timestamp: new Date().toISOString(),
        };

        const compositeKey = ctx.stub.createCompositeKey('DesignatedBank~WalletAddress', [designatedBank, walletAddress]);
        await ctx.stub.putState(compositeKey, Buffer.from(JSON.stringify(validationRequest)));
        return JSON.stringify(validationRequest);
    }

    async getRequestValidation(ctx, walletAddress, designatedBank) {
        const compositeKey = ctx.stub.createCompositeKey('DesignatedBank~WalletAddress', [designatedBank, walletAddress]);
        const validationRequestAsBytes = await ctx.stub.getState(compositeKey);

        if (!validationRequestAsBytes || validationRequestAsBytes.length === 0) {
            throw new Error(`No validation request found for customer: ${walletAddress} and designated bank: ${designatedBank}`);
        }

        return validationRequestAsBytes.toString('utf-8');
    }
    async getRequestsByDesignatedBank(ctx, designatedBank) {
        const iterator = await ctx.stub.getPrivateDataByPartialCompositeKey('DesignatedBank~WalletAddress', [designatedBank]);
        const requests = [];

        let result = await iterator.next();
        while (!result.done) {
            const compositeKey = result.value.key;
            const [, walletAddress] = ctx.stub.splitCompositeKey(compositeKey);
            const requestAsBytes = await ctx.stub.getState(compositeKey);
            const request = JSON.parse(requestAsBytes.toString('utf-8'));
            requests.push({
                walletAddress: walletAddress,
                request: request,
            });

            result = await iterator.next();
        }
        await iterator.close();

        return JSON.stringify(requests);
    }


    async _isFinancialInstitution(ctx, institution, peerMSPID) {
        const institutionsKey = 'approvedFinancialInstitutions';
        const approvedInstitutionsBytes = await ctx.stub.getState(institutionsKey);
        let approvedFinancialInstitutions = [];

        if (approvedInstitutionsBytes && approvedInstitutionsBytes.length > 0) {
            approvedFinancialInstitutions = JSON.parse(approvedInstitutionsBytes.toString());
        }

        return approvedFinancialInstitutions.some(
            (fi) => fi.institution === institution && fi.mspid === peerMSPID
        );
    }

    async addApprovedFinancialInstitution(ctx, institution, mspid) {
        const institutionsKey = 'approvedFinancialInstitutions';
        const approvedInstitutionsBytes = await ctx.stub.getState(institutionsKey);
        let approvedFinancialInstitutions = [];

        if (approvedInstitutionsBytes && approvedInstitutionsBytes.length > 0) {
            approvedFinancialInstitutions = JSON.parse(approvedInstitutionsBytes.toString());
        }

        approvedFinancialInstitutions.push({ institution, mspid });
        await ctx.stub.putState(institutionsKey, Buffer.from(JSON.stringify(approvedFinancialInstitutions)));
    }
    async removeApprovedFinancialInstitution(ctx, institution, mspid) {
        const institutionsKey = 'approvedFinancialInstitutions';
        const approvedInstitutionsBytes = await ctx.stub.getState(institutionsKey);
        let approvedFinancialInstitutions = [];
        if (approvedInstitutionsBytes && approvedInstitutionsBytes.length > 0) {
            approvedFinancialInstitutions = JSON.parse(approvedInstitutionsBytes.toString());
        }
        approvedFinancialInstitutions = approvedFinancialInstitutions.filter(
            (fi) => !(fi.institution === institution && fi.mspid === mspid)
        );
        await ctx.stub.putState(institutionsKey, Buffer.from(JSON.stringify(approvedFinancialInstitutions)));
    }
    async getApprovedFinancialInstitutions(ctx) {
        const institutionsKey = 'approvedFinancialInstitutions';
        const approvedInstitutionsBytes = await ctx.stub.getState(institutionsKey);
        if (!approvedInstitutionsBytes || approvedInstitutionsBytes.length === 0) {
            return 'No approved financial institutions found';
        }
        return JSON.parse(approvedInstitutionsBytes.toString());
    }
    async createUserProfile(ctx, userId, ethereumAddress) {
        const userProfile = new UserProfile(userId, ethereumAddress);
        await ctx.stub.putState(userId, Buffer.from(JSON.stringify(userProfile)));
        return JSON.stringify(userProfile);
    }

    async getUserProfile(ctx, userId) {
        const userProfileBytes = await ctx.stub.getState(userId);
        if (!userProfileBytes || userProfileBytes.length === 0) {
            throw new Error(`UserProfile ${userId} does not exist`);
        }
        return JSON.parse(userProfileBytes.toString());
    }
}

module.exports = KycChaincode;

