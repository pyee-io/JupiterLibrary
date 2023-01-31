import utils from './utils.js'; // generic import, requires "utils" namespace to be used in code

/**
 * Represents a Jupiter document.
 * @constructor
 * @param {Object} doc - The document object itself
 * @property {string} id - Unique identifier (ThoughtTrace)
 * @property {string} name - Document name
 *
 * @property {string} document_type - Document Type
 * @property {string} project_id - Project ID
 * @property {string} project_name - Project Name
 * @property {Date} effective_date - Effective date of the document
 *
 * @property {Array} lease_terms - array of potential lease terms
 * @property {Date} lease_terms.start_date - start date of lease term
 * @property {Date} lease_terms.end_date - end date of lease term
 *
 * @property {Array} periodic_payment_models - array of periodic payment models
 * @property {Array} tags - array of tags
 */
class JupiterDoc {
    constructor(doc, factTypes, docTypes = [], tags = []) {
        // remove clutter
        this.cleanDoc(doc);
        utils.addFactandFieldNames(doc, factTypes);

        // set initial properties
        this.rawDoc = doc;
        this.id = doc.id;
        this.name = doc.name;

        // set fact-based properties and arrays
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

        // Document Type
        var docType = docTypes.find((x) => x.id === doc.documentTypeId);
        this.document_type = docType ? docType.name : null;

        // Agreement ID
        this.agreement_id = utils.extractFactValue(
            doc,
            utils.getFactTypeId('Agreement ID', factTypes),
            utils.getFactFieldId('Agreement ID', 'Agreement ID', factTypes),
            'string'
        );

        // Project ID
        this.project_id = utils.extractFactValue(
            doc,
            utils.getFactTypeId('Project ID', factTypes),
            utils.getFactFieldId('Project ID', 'Project ID', factTypes),
            'string'
        );

        // Project Name
        this.project_name = utils.extractFactValue(
            doc,
            utils.getFactTypeId('Project Name', factTypes),
            utils.getFactFieldId('Project Name', 'Project Name', factTypes),
            'string'
        );

        // Grantor/Lessor - Multi-instance fact
        this.grantor = utils.extractMultiFactValues(doc, utils.getFactTypeId('Grantor/Lessor', factTypes));

        // Effective Date
        this.effective_date = utils.extractFactValue(
            doc,
            utils.getFactTypeId('Effective Date', factTypes),
            utils.getFactFieldId('Effective Date', 'Effective Date', factTypes),
            'date'
        );

        // Amendment Date
        this.amendment_date = utils.extractFactValue(
            doc,
            utils.getFactTypeId('Amendment Date', factTypes),
            utils.getFactFieldId('Amendment Date', 'Amendment Date', factTypes),
            'date'
        );

        // Leased Acres
        this.leased_acres = utils.extractFactValue(
            doc,
            utils.getFactTypeId('Leased Acres', factTypes),
            utils.getFactFieldId('Leased Acres', 'Leased Acres', factTypes),
            'number'
        );

        // Operational Details
        this.operational_details = utils.extractFactMultiFields(doc, utils.getFactTypeId('Operational Details', factTypes));

        // Lease Terms
        this.lease_terms = utils.extractMultiFactValues(doc, utils.getFactTypeId('Lease Term', factTypes));

        // Periodic Payment Models
        this.periodic_payment_models = utils.extractMultiFactValues(doc, utils.getFactTypeId('Periodic Payment Model', factTypes));

        // Tags
        this.tags = this.getTags(tags);

        // Review Status
        this.review_status = utils.extractFactValue(
            doc,
            utils.getFactTypeId('Review Status', factTypes),
            utils.getFactFieldId('Review Status', 'Review Status', factTypes),
            'string'
        );

        // Review Status Notes
        this.review_status_notes = utils.extractFactValue(
            doc,
            utils.getFactTypeId('Review Status', factTypes),
            utils.getFactFieldId('Review Status', 'Notes', factTypes),
            'string'
        );

        // calculate lease term dates
        this.calcLeaseTermDates(this.lease_terms, this.effective_date);
    }

    /**
     * creates array of tag names from tag ids
     */
    getTags(tags) {
        var result = [];
        this.rawDoc.tagIds.forEach((id) => {
            var tag = tags.find((x) => x.id === id);

            if (tag) {
                result.push(tags.find((x) => x.id === id).name);
            }
        });

        return result;
    }

    /**
     * calculates the term dates from the given facts
     * This function mutates lease term objects and creates calculated properties
     */
    calcLeaseTermDates(leaseTerms, effectiveDate) {
        // exit if no effectiveDate
        if (!effectiveDate) {
            return;
        }

        leaseTerms
            .sort((a, b) => a.term_ordinal - b.term_ordinal)
            .forEach((term, index) => {
                // start day after previous term end, or if no previous term, use effective date
                term.start_date = leaseTerms[index - 1] ? leaseTerms[index - 1].end_date.plus({ days: 1 }) : effectiveDate;
                term.start_date_text = term.start_date.toFormat('M/d/yyyy');

                // end one day prior to the Nth anniversary
                term.end_date = term.start_date.plus({ years: term.term_length_years }).plus({ days: -1 });
                term.end_date_text = term.end_date.toFormat('M/d/yyyy');

                // calculate previous periods on same payment model for periodic escalation
                // NOTE: this will not continue periodic escalations across payment models
                term.previous_periods = leaseTerms
                    .filter((x) => x.term_ordinal < term.term_ordinal && x.payment_model === term.payment_model)
                    .reduce((accumulator, t) => accumulator + t.term_length_years, 0);

                // calculate perevious terms for term escalation
                term.previous_terms = leaseTerms.filter((x) => x.term_ordinal < term.term_ordinal && x.payment_model === term.payment_model).length;
            });
    }

    /**
     * calculates base periodic payment for a given model
     * largest of all possible ways to calculate payment
     */
    periodicBasePayment(model, compounding_escalation, term_escalation_rate, term_escalation_amount, previous_terms, leased_acres) {
        if (!model) {
            return 0;
        }

        // calculate max payment from different methods
        var base = Math.max(
            model.minimum_payment ?? 0,
            (model.payment_per_mw ?? 0) * (model.mw ?? 0),
            (model.inverter_count ?? 0) * (model.inverter_rating_mvas ?? 0) * (model.payment_per_mva ?? 0),
            model.flat_payment_amount ?? 0,
            (model.payment_per_acre ?? 0) * (leased_acres ?? 0)
        );

        // apply amount escalation
        base = base + ((term_escalation_amount ?? 0) * previous_terms ?? 0);

        // apply rate escalation
        if (compounding_escalation) {
            base = utils.calculateCompoundingGrowth(base, term_escalation_rate ?? 0 / 100, previous_terms ?? 0);
        } else {
            base = utils.calculateGrowth(base, term_escalation_rate ?? 0 / 100, previous_terms ?? 0);
        }

        return base;
    }

    /***
     * assign model to given lease term
     */

    termPaymentModel(term, paymentModels) {
        // exit if there are no models
        if (!paymentModels || paymentModels.length === 0) {
            return null;
        }

        const model_name = term.payment_model ?? term.term_type;
        // return model if name matches, or first model if no name
        return model_name ? paymentModels.find((x) => x.model_type === model_name) : paymentModels[0];
    }

    /***
     * calculate payment period end
     */
    calcPaymentPeriodEnd(start_date, frequency, prorated, term_end) {
        var payment_period_end;

        if (prorated) {
            // pro-rated payment dates
            if (frequency === 'Annually') {
                payment_period_end = new luxon.DateTime.local(start_date.year, 12, 31);
            } else if (frequency === 'Quarterly') {
                payment_period_end = new luxon.DateTime.local(start_date.year, start_date.month + 3, 1).minus({ days: 1 });
            } else if (frequency === 'Monthly') {
                payment_period_end = new luxon.DateTime.local(start_date.year, start_date.month, 1).plus({ months: 1 }).minus({ days: 1 });
            }
        } else {
            // anniversary payment dates
            if (frequency === 'Annually') {
                payment_period_end = start_date.plus({ years: 1 }).minus({ days: 1 });
            } else if (frequency === 'Quarterly') {
                payment_period_end = start_date.plus({ months: 3 }).minus({ days: 1 });
            } else if (frequency === 'Monthly') {
                payment_period_end = start_date.plus({ months: 1 }).minus({ days: 1 });
            }
        }

        // if payment period end is after term end, return term end
        return payment_period_end > term_end ? term_end : payment_period_end;
    }

    /***
     * calculate periodic payments for a given term
     */

    calcPeriodicPaymentsForTerm(term, paymentModels, leased_acres) {
        const payments = [];

        // get payment model for this term
        const model = this.termPaymentModel(term, paymentModels);
        const periodic_payment = this.periodicBasePayment(
            model,
            term.compounding_escalation,
            term.escalation_rate,
            term.escalation_amount,
            term.previous_terms,
            leased_acres
        );

        // exit if no model, or start/end dates
        if (!model || !term.start_date || !term.end_date) {
            return null;
        }

        // initialize variables
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

        var i = 0;
        var prorata_factor;
        var term_payment_delay_days = term.term_payment_delay_days ?? 0;
        var payment_period_start = term.start_date.plus({ days: term.term_payment_delay_days });
        var payment_date;
        var payment_period_end;
        var lag_days;

        // var term_escalation_rate = term.escalation_rate ?? 0;
        var periodic_escalation_rate = model.periodic_escalation_rate ?? 0;

        // calc first payment date for term
        switch (term.first_payment_start) {
            case 'Start with Term (plus applicable lag)':
                payment_date = term.start_date.plus({ days: term_payment_delay_days });
                break;
            case 'Start next Jan 1 after Term commencement':
                payment_date = new luxon.DateTime.local(term.start_date.year + 1, 1, 1).plus({ days: term_payment_delay_days });
                break;
            case 'Start 1st of month after commencement':
                payment_date = new luxon.DateTime.local(payment_period_start.year, payment_period_start.month, 1).plus({ months: 1 });
                break;
            // add more cases as they arise
            default:
                payment_date = term.start_date;
        }

        // loop through remaining payments
        while (payment_period_start < term.end_date) {
            // calculate payment period end date
            payment_period_end = this.calcPaymentPeriodEnd(payment_date, model.payment_frequency, term.prorated, term.end_date);

            if (!payment_period_end) return;

            // calculate pro rata periods
            if (model.payment_frequency === 'Annually') {
                prorata_factor = utils.round(payment_period_end.plus({ days: 1 }).diff(payment_period_start, 'years').years, 4);
            } else if (model.payment_frequency === 'Quarterly') {
                prorata_factor = utils.round(payment_period_end.plus({ days: 1 }).diff(payment_period_start, 'quarters').quarters, 4);
            } else if (model.payment_frequency === 'Monthly') {
                prorata_factor = utils.round(payment_period_end.plus({ days: 1 }).diff(payment_period_start, 'months').months, 4);
            }

            lag_days = i === 0 ? term.first_payment_lag_days ?? 0 : 0;

            payments.push({
                payment_index: i,
                payment_date: payment_date
                    .plus({
                        days: lag_days,
                    })
                    .toLocaleString(),
                payment_period_start: payment_period_start.toLocaleString(),
                payment_period_end: payment_period_end.toLocaleString(),
                prorata_factor: prorata_factor,
                // base_payment: utils.round(periodic_payment * (1 + term_escalation_rate / 100), 4),
                total_payment_amount:
                    utils.calculateCompoundingGrowth(periodic_payment, periodic_escalation_rate, i + term.previous_periods) * prorata_factor,
            });

            payment_period_start = payment_period_end.plus({ days: 1 });
            payment_date = payment_period_end.plus({ days: 1 });
            i++;
        }

        payments.sort((a, b) => a.payment_date - b.payment_date);

        // mutate term object to store payment array
        return payments;

        // calc total payments for whole term
        //term.cumulative_payment_amount = payments.reduce((a, b) => a + b.total_payment_amount, 0);
    }

    /***
     * calc payments on all terms for the lease
     */
    calcAllTermPayments() {
        // calc payments in each term
        this.lease_terms.forEach((term) => {
            if (this.periodic_payment_models) {
                term.payments = this.calcPeriodicPaymentsForTerm(
                    term,
                    this.amended_periodic_payment_models ?? this.periodic_payment_models,
                    this.amended_leased_acres ?? this.leased_acres
                );
            }
        });
    }

    /**
     * load amendments & create new properties to store them
     */

    processAmendments(allDocs) {
        const amendments = allDocs.filter((x) => x.agreement_id === this.agreement_id && x.amendment_date && x.id !== this.id);
        if (amendments) {
            // sort amendments by amendment date, adding an ordinal property
            amendments
                .sort((a, b) => {
                    return new Date(a.amendment_date) - new Date(b.amendment_date);
                })
                .map((x) => (x.amendment_ordinal = amendments.indexOf(x) + 1));

            // check each amendment for new values
            // newer amendments overwrite older values
            amendments.forEach((amendment) => {
                // leased acres
                // only write if different from parent doc
                if (amendment.leased_acres && amendment.leased_acres !== this.leased_acres) {
                    this.amended_leased_acres = amendment.leased_acres;
                }

                // lease terms
                if (amendment.lease_terms && amendment.lease_terms.length > 0) {
                    this.amended_lease_terms = amendment.lease_terms;
                }

                // periodic payment models
                if (amendment.periodic_payment_models && amendment.periodic_payment_models.length > 0) {
                    this.amended_periodic_payment_models = amendment.periodic_payment_models;
                }
            });

            // re-calculate payments based on amended values
            if (this.lease_terms) {
                this.calcAllTermPayments();
            }
        }
    }

    /**
     * clean unused fields from document object
     * just makes debugging easier
     */
    cleanDoc(doc) {
        // fields to delete
        const fields = [
            'archivedBy',
            'archivedOn',
            'highlightedText',
            'pageManipulationStatus',
            'processingStatus',
            'pages',
            'securityLabelId',
            'sourceDocumentId',
            'sourceDocumentName',
            'pageCount',
            'thoughts',
            'userIds',
        ];

        fields.forEach((field) => {
            delete doc[field];
        });

        return doc;
    }
}

export default JupiterDoc;
