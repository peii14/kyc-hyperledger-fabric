'use strict';

const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');
const argon2 = require('argon2');

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

    async requestValidation(ctx, customerId, walletAddress, currentStatus, email, password) {
        const hashedPassword = await argon2.hash(password);

        const validationRequest = {
            customerId: customerId,
            walletAddress: walletAddress,
            status: currentStatus,
            timestamp: new Date().toISOString(),
        };

        await ctx.stub.putState(customerId, Buffer.from(JSON.stringify(validationRequest)));

        // Register the client account
        const clientAccount = {
            email: email,
            password: hashedPassword,
            customerId: customerId,
        };

        await ctx.stub.putState(`account_${email}`, Buffer.from(JSON.stringify(clientAccount)));
    }

    async getRequestValidation(ctx, customerId) {
        const validationRequestAsBytes = await ctx.stub.getState(customerId);
        if (!validationRequestAsBytes || validationRequestAsBytes.length === 0) {
            throw new Error(`No validation request found for customer: ${customerId}`);
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
    
        return approvedInstitutionsBytes.toString('utf-8');
    }    
}

module.exports = KycChaincode;
