import { describe, expect, it } from 'vitest';

import {
  defaultStep7Fields,
  validateStep7Answer,
  validateStep7Completion
} from '../src/lib/investor-profile-step7.js';

const baseContext = { requiresJointOwnerSignature: false };

function buildCompleteStep7Fields(requiresJointOwnerSignature: boolean) {
  const fields = defaultStep7Fields();
  fields.certifications.acceptances = {
    attestationsAccepted: true,
    taxpayerCertificationAccepted: true,
    usPersonDefinitionAcknowledged: true
  };
  fields.signatures.accountOwner = {
    typedSignature: 'John Smith',
    printedName: 'John Smith',
    date: '2026-02-27'
  };
  fields.signatures.financialProfessional = {
    typedSignature: 'Advisor One',
    printedName: 'Advisor One',
    date: '2026-02-27'
  };

  if (requiresJointOwnerSignature) {
    fields.signatures.jointAccountOwner = {
      typedSignature: 'Jane Smith',
      printedName: 'Jane Smith',
      date: '2026-02-27'
    };
  }

  return fields;
}

describe('investor-profile-step7', () => {
  it('requires all certification acceptance checkboxes', () => {
    const invalid = validateStep7Answer('step7.certifications.acceptances', {
      attestationsAccepted: true,
      taxpayerCertificationAccepted: false,
      usPersonDefinitionAcknowledged: true
    }, baseContext);
    expect(invalid.success).toBe(false);

    const valid = validateStep7Answer('step7.certifications.acceptances', {
      attestationsAccepted: true,
      taxpayerCertificationAccepted: true,
      usPersonDefinitionAcknowledged: true
    }, baseContext);
    expect(valid.success).toBe(true);
  });

  it('requires account owner signature block always', () => {
    const invalid = validateStep7Answer('step7.signatures.accountOwners', {
      accountOwner: {
        typedSignature: '',
        printedName: '',
        date: ''
      },
      jointAccountOwner: {
        typedSignature: '',
        printedName: '',
        date: ''
      }
    }, baseContext);
    expect(invalid.success).toBe(false);
  });

  it('requires joint owner signature only when context requires it', () => {
    const withoutJointRequired = validateStep7Answer('step7.signatures.accountOwners', {
      accountOwner: {
        typedSignature: 'John Smith',
        printedName: 'John Smith',
        date: '2026-02-27'
      },
      jointAccountOwner: {
        typedSignature: '',
        printedName: '',
        date: ''
      }
    }, { requiresJointOwnerSignature: false });
    expect(withoutJointRequired.success).toBe(true);

    const withJointRequired = validateStep7Answer('step7.signatures.accountOwners', {
      accountOwner: {
        typedSignature: 'John Smith',
        printedName: 'John Smith',
        date: '2026-02-27'
      },
      jointAccountOwner: {
        typedSignature: '',
        printedName: '',
        date: ''
      }
    }, { requiresJointOwnerSignature: true });
    expect(withJointRequired.success).toBe(false);
  });

  it('requires financial professional signature and allows empty supervisor block', () => {
    const invalid = validateStep7Answer('step7.signatures.firm', {
      financialProfessional: {
        typedSignature: '',
        printedName: '',
        date: ''
      },
      supervisorPrincipal: {
        typedSignature: '',
        printedName: '',
        date: ''
      }
    }, baseContext);
    expect(invalid.success).toBe(false);

    const valid = validateStep7Answer('step7.signatures.firm', {
      financialProfessional: {
        typedSignature: 'Advisor One',
        printedName: 'Advisor One',
        date: '2026-02-27'
      },
      supervisorPrincipal: {
        typedSignature: '',
        printedName: '',
        date: ''
      }
    }, baseContext);
    expect(valid.success).toBe(true);
  });

  it('enforces supervisor optional all-or-none rule', () => {
    const invalid = validateStep7Answer('step7.signatures.firm', {
      financialProfessional: {
        typedSignature: 'Advisor One',
        printedName: 'Advisor One',
        date: '2026-02-27'
      },
      supervisorPrincipal: {
        typedSignature: 'Principal One',
        printedName: '',
        date: ''
      }
    }, baseContext);
    expect(invalid.success).toBe(false);
  });

  it('rejects future signature dates', () => {
    const invalid = validateStep7Answer('step7.signatures.firm', {
      financialProfessional: {
        typedSignature: 'Advisor One',
        printedName: 'Advisor One',
        date: '2099-01-01'
      },
      supervisorPrincipal: {
        typedSignature: '',
        printedName: '',
        date: ''
      }
    }, baseContext);
    expect(invalid.success).toBe(false);
  });

  it('passes completion checks for valid payload', () => {
    const fields = buildCompleteStep7Fields(true);
    const errors = validateStep7Completion(fields, { requiresJointOwnerSignature: true });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
