const { default: mongoose } = require("mongoose");

const payRequestschema = new mongoose.Schema({

    	p_id:{
            type:String
        },

        payId:{
            type:String
        },

        payType:{
            type:String

        },	
        amountPaid:{
            type:String
        },	
        amountForCustomer:{
            type:String
        },
        debitDate:{
            type:String
        },
        paidFor:{
            type:String
        },
        other:{
            type:String
        },	
        vendor:{
            type:String
        },	
        poNumber:{
            type:String
        },	
        poValue:{
            type:String

        },	
        totalAdvancePaid:{
            type:String
        },
        poBalance:{
            type:String
        },	
        paidTo:{
            type:String
        },	
        benificiaryName:{
            type:String
        },	
        accuntNumber:{
            type:String
        },	
        ifsc:{
            type:String
        },	
        branch:{
            type:String
        },	
        createdOn:{
            type:String
        },	
        submittedBy:{
            type:String
        },	
        approved:{
            type:String
        },	
        disable:{
            type:String
        },
        accountMatch:{
            type:String
        },	
        utr:{
            type:String
        },	
        comment:{
            type:String
        }

},{timestamps:true})

module.exports= mongoose.model("payRequest",payRequestschema);