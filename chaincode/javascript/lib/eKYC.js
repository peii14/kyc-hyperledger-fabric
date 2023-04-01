
const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');
// const argon2 = require('argon2');

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

    async submitKycData(ctx, customerId, kycData) {
        const encryptedData = this._encryptData(kycData);
        const privateData = ctx.stub.createTransientMap();
        privateData.set(customerId, encryptedData);
        await ctx.stub.putPrivateData('customerPrivateData', customerId, Buffer.from(JSON.stringify(privateData)));
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
        return this._decryptData(encryptedData);
    }

    async requestValidation(ctx, walletAddress, currentStatus) {
        // const hashedPassword = await argon2.hash(password,{
        //     salt: saltBuf,
        //     type: argon2.argon2id,
        //     memoryCost: 2**16,
        //     hashLength: 32,
        //     parallelism: 1,
        //     timeCost: 3,
        //     saltLength: 32,
        // });

        const validationRequest = {
            status: currentStatus,
            timestamp: new Date().toISOString(),
        };

        await ctx.stub.putState(walletAddress, Buffer.from(JSON.stringify(validationRequest)));

        // // Register the client account
        // const clientAccount = {
        //     password: hashedPassword,
        //     customerId: customerId,
        // };

        // await ctx.stub.putState(Buffer.from(JSON.stringify(clientAccount)));
    }

    async getRequestValidation(ctx, walletAddress) {
        const validationRequestAsBytes = await ctx.stub.getState(walletAddress);
        if (!validationRequestAsBytes || validationRequestAsBytes.length === 0) {
            throw new Error(`No validation request found for customer: ${walletAddress}`);
        }
        return validationRequestAsBytes.toString('utf-8');
    }

    _encryptData(data) {
        const cipher = crypto.createCipheriv('aes-256-cbc', process.env.ENCRYPTION_KEY, process.env.ENCRYPTION_IV);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    _decryptData(encryptedData) {
        const decipher = crypto.createDecipheriv('aes-256-cbc', process.env.ENCRYPTION_KEY, process.env.ENCRYPTION_IV);
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
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

