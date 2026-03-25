'use strict';
const FeesStructureModel = require('../models/fees-structure');
const ClassModel = require('../models/class');
const FeesCollectionModel = require('../models/fees-collection');
const StudentModel = require('../models/student');

let GetSingleClassFeesStructureByStream = async (req, res, next) => {
    let adminId = req.params.id;
    let className = req.params.class;
    let stream = req.params.stream;
    if (stream === "stream") {
        stream = "n/a";
    }
    try {
        const singleFeesStr = await FeesStructureModel.findOne({ adminId: adminId, class: className, stream: stream });
        if (!singleFeesStr) {
            return res.status(404).json('Fee Structure not found!')
        }
        return res.status(200).json(singleFeesStr);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
let GetSingleClassFeesStructure = async (req, res, next) => {
    let adminId = req.params.id;
    try {
        const singleFeesStr = await FeesStructureModel.find({ adminId: adminId });
        if (!singleFeesStr) {
            return res.status(404).json('Fee Structure not found!')
        }
        return res.status(200).json(singleFeesStr);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}
let GetSingleSessionFeesStructure = async (req, res, next) => {
    let adminId = req.params.id;
    let session = req.params.session;
    try {
        const singleFeesStr = await FeesStructureModel.find({ adminId: adminId, session: session });
        if (!singleFeesStr) {
            return res.status(404).json('Fee Structure not found!')
        }
        return res.status(200).json(singleFeesStr);
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let CreateFeesStructure = async (req, res, next) => {
    let className = req.body.class;
    let { adminId, stream, session, admissionFees, totalFees } = req.body;
    let feesType = req.body.type.feesType;
    if (stream === "stream") {
        stream = "n/a";
    }
    let feesTypeTotal = feesType.reduce((total, obj) => {
        let value = Object.values(obj)[0];
        return total + value;
    }, 0);
    try {
        const checkClassExist = await ClassModel.findOne({ class: className });
        if (!checkClassExist) {
            return res.status(404).json('Invalid class!');
        }
        const checkFeesStructure = await FeesStructureModel.findOne({ adminId: adminId, session: session, class: className, stream: stream });
        if (checkFeesStructure) {
            return res.status(400).json(`Fee structure already exist for session ${session}!`);
        }
        if (totalFees!== feesTypeTotal) {
            return res.status(400).json(`Total fees is not equal to all fees particulars total!`);
        }
        let feesStructureData = {
            adminId: adminId,
            class: className,
            stream: stream,
            session,
            admissionFees: admissionFees,
            totalFees: totalFees,
            feesType: feesType,
        }
        let feesStructure = await FeesStructureModel.create(feesStructureData);
        if (feesStructure) {
            let admissionFees = feesStructure.admissionFees;
            let checkStudent = await StudentModel.find({ adminId: adminId, session, class: className, stream: stream });
            if (checkStudent) {
                let studentFeesData = [];
                for (let i = 0; i < checkStudent.length; i++) {
                    let totalFees = feesStructure.totalFees - checkStudent[i].feesConcession;
                    let feesObject = {
                        adminId: adminId,
                        studentId: checkStudent[i]._id,
                        session,
                        currentSession:session,
                        class: className,
                        stream: stream,
                        previousSessionFeesStatus: false,
                        previousSessionClass: 0,
                        previousSessionStream: "empty",
                        admissionFeesPayable: false,
                        admissionFees: 0,
                        totalFees: totalFees,
                        paidFees: 0,
                        dueFees: totalFees,
                        AllTotalFees: totalFees,
                        AllPaidFees: 0,
                        AllDueFees: totalFees,
                        feesConcession: checkStudent[i].feesConcession,
                        allFeesConcession: checkStudent[i].feesConcession,
                    };

                    if (checkStudent.admissionType === 'New') {
                        feesObject.admissionFeesPayable = true;
                        feesObject.totalFees += admissionFees;
                        feesObject.dueFees += admissionFees;
                        feesObject.AllTotalFees += admissionFees;
                        feesObject.AllPaidFees += admissionFees;
                        feesObject.AllDueFees = feesObject.totalFees - feesObject.paidFees;
                    }

                    studentFeesData.push(feesObject);
                }
                if (checkStudent && studentFeesData.length > 0) {
                    const checkStudentFeesData = await FeesCollectionModel.create(studentFeesData);
                    if (checkStudentFeesData) {
                        return res.status(200).json('Fees structure created successfully');
                    }
                }
            }
            return res.status(200).json('Fees structure created successfully');
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
}

let DeleteFeesStructure = async (req, res, next) => {
    try {
        const id = req.params.id;
        const feesStructure = await FeesStructureModel.findById(id);
        if (!feesStructure) {
            return res.status(404).json('Fees structure not found!');
        }
        const adminId = feesStructure.adminId;
        const session = feesStructure.session;
        const className = feesStructure.class;
        const stream = feesStructure.stream;
        const previousSessionFeesStructure = await FeesCollectionModel.findOne({ adminId: adminId,session:session,previousSessionClass:className,previousSessionStream :stream  })
        if(previousSessionFeesStructure!==null){
            if(previousSessionFeesStructure.dueFees>0){
                return res.status(400).json(`The fee structure for academic session ${session} cannot be deleted for this class, as there are pending dues for this session!`);
            }
        }
        const [deleteFeesRecord, deleteFeesStructure] = await Promise.all([
            FeesCollectionModel.deleteMany({ adminId: adminId,currentSession:session,class:className,stream :stream  }),
            FeesStructureModel.findByIdAndRemove(id),
        ]);
        if (deleteFeesRecord.deletedCount > 0 || deleteFeesStructure) {
            return res.status(200).json('Fees structure deleted successfully');
        } else {
            return res.status(500).json('Failed to deleted Fees structure');
        }
    } catch (error) {
        return res.status(500).json('Internal Server Error!');
    }
};

module.exports = {
    GetSingleClassFeesStructure,
    GetSingleSessionFeesStructure,
    GetSingleClassFeesStructureByStream,
    CreateFeesStructure,
    DeleteFeesStructure

}