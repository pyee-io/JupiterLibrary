// quick test report

const allDocs = (docs) => {
  return docs.filter((doc) => doc.agreement_terms.length > 0);
};

const devDecisions = (docs, outlookDays) => {
  // get all option terms coming due in the next outlookDays
  var options = docs.filter((doc) => {
    return (
      // find docs that are options and have a term starting soon
      (doc.document_type?.toLowerCase().includes("option") || doc.document_type?.toLowerCase() === "lease") &&
      doc.agreement_terms?.some((term) => {
        if (term.start_date) {
          // start date must be between today and the outlookDays
          var startDate = new luxon.DateTime.fromMillis(term.start_date?.ts);
          return startDate <= luxon.DateTime.now().plus({ days: outlookDays }) && startDate >= luxon.DateTime.now();
        }
      })
    );
  });

  return options.map((doc) => {
    // select the term that's coming due
    var upcomingTerm = doc.agreement_terms.filter((term) => {
      if (term.start_date) {
        var startDate = new luxon.DateTime.fromMillis(term.start_date?.ts);
        return startDate <= luxon.DateTime.now().plus({ days: outlookDays }) && startDate >= luxon.DateTime.now();
      }
    });

    // select current term
    var currentTerm = doc.agreement_terms.filter((term) => {
      if (term.start_date) {
        var startDate = new luxon.DateTime.fromMillis(term.start_date?.ts);
        var endDate = new luxon.DateTime.fromMillis(term.end_date?.ts);
        return startDate <= luxon.DateTime.now() && endDate >= luxon.DateTime.now();
      }
    });

    // consolidate payments into a single array
    var allPayments = doc.date_payments;
    doc.term_payment_models.forEach((model) => {
      allPayments = allPayments.concat(model.payments);
    });

    return {
      agreement_group: doc.agreement_group,
      upcomingTerm: upcomingTerm,
      currentTerm: currentTerm,
      allPayments: allPayments,
      termModels: doc.term_payment_models,
      dateModels: doc.date_payment_models,
      rawDoc: doc,
    };
  });
};

const LandControlReport = (docs) => {
  const agreementGroupExcludeRegex = /^(?!MSA|DEED|Grazing|TAX|ASSET)/i;
  const purchased = docs.filter(
    (x) => x.agreement_group && x.effective_date && !x.termination?.termination_date && agreementGroupExcludeRegex.test(x.agreement_group)
  );

  const controlled = purchased.map((agmt) => {
    return {
      id: agmt.id,
      agreement_group: agmt.agreement_group,
      county: [...new Set(agmt.property_description.map((prop) => prop.county?.toUpperCase()))].join(", "),
      state: [...new Set(agmt.property_description.map((prop) => prop.state?.toUpperCase()))].join(", "),
      grantors: agmt.grantor?.map((g) => g["grantor/lessor_name"]).join(", "),
      project: agmt.project_name,
      project_id: agmt.project_id,
      effective_date: agmt.effective_date.toFormat("yyyy-MM-dd"),
      date_closed: agmt.date_closed?.toFormat("yyyy-MM-dd"),
      estimated_closing_date: agmt.estimated_closing_date?.toFormat("yyyy-MM-dd"),
      final_term_end_date: agmt.final_term_end_date
        ? new luxon.DateTime.fromFormat(agmt.final_term_end_date, "M/d/yyyy").toFormat("yyyy-MM-dd")
        : null,
      total_acres: agmt.total_agreement_acres,
      full_purchase_price: agmt.full_purchase_price,
      //deed_count: agmt.deeds.length,
    };
  });

  return controlled;
};

export { allDocs, devDecisions, LandControlReport };
