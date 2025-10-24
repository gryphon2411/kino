---
mode: ask
description: Generate effective research prompts for technical challenges
---

## Research AI Prompt Template

Use this template to generate effective research prompts for technical challenges across various domains.

**Technology Stack:** ${input:techStack:technology/framework}
**Specific Challenge:** ${input:challenge:specific functionality}
**Error/Issue:** ${input:issue:specific error or issue}

### **Context:**
[Brief description of the technical challenge or problem domain]

### **Current Situation:**
[Specific details about what's currently not working or needs clarification]

### **Core Question:**
[Clear, focused question that gets to the heart of the issue]

### **Specific Technical Questions:**
1. [First specific technical aspect to research]
2. [Second specific technical aspect to research]
3. [Third specific technical aspect to research]
4. [Best practices or established patterns relevant to the issue]

### **Relevant File Context:**
**IMPORTANT: External AIs cannot access your files. Describe file contents explicitly.**

- **[File 1]**: [Brief description] - [Include relevant code snippets or describe key configurations]
- **[File 2]**: [Brief description] - [Include relevant code snippets or describe key configurations]
- **[File 3]**: [Brief description] - [Include relevant code snippets or describe key configurations]
- Workspace: ${workspaceFolderBasename}

### **Desired Outcome:**
[A clear, actionable recommendation or definitive answer]

### **Example Usage - General Template:**

**Context:** I'm working on a ${input:techStack} project that involves ${input:challenge}.

**Current Situation:** [Component/feature] is failing with ${input:issue} because [reason].

**Core Question:** What is the proper approach for [specific technical challenge]?

**Specific Technical Questions:**
1. Architecture: How should [component] be structured?
2. Configuration: What is the correct way to configure [specific settings]?
3. Integration: How to properly integrate [component A] with [component B]?
4. Best Practices: Are there established patterns for this type of implementation?

**Relevant File Context:**
**IMPORTANT: External AIs cannot access files. Describe contents explicitly.**

- **[File 1]**: [Brief description of file's role] - [Include relevant code snippets or describe key configurations]
- **[File 2]**: [Brief description of file's role] - [Include relevant code snippets or describe key configurations]
- **[File 3]**: [Brief description of file's role] - [Include relevant code snippets or describe key configurations]

**Desired Outcome:** A clear, industry-standard approach for [specific technical challenge].

### **Example Usage - Specific (Kubernetes/Helm):**

**Context:** I'm working on a Kubernetes infrastructure migration project using Helm.

**Current Situation:** The umbrella chart was automatically generated with standard Helm templates but they're failing linting due to missing values references.

**Core Question:** What is the proper structure for a Helm umbrella chart that orchestrates multiple subcharts?

**Specific Technical Questions:**
1. Template Cleanup: What templates should remain in an umbrella chart?
2. Values Structure: How should the umbrella chart's values.yaml be structured?
3. Linting Strategy: How to make the umbrella chart pass helm lint?
4. Best Practices: Are there established patterns for infrastructure umbrella charts?

**Relevant File Context:**
**IMPORTANT: External AIs cannot access files. Describe contents explicitly.**

- **Chart.yaml**: Defines subchart dependencies - Contains dependencies section listing MongoDB, PostgreSQL, Redis Stack, Kafka subcharts
- **Values files**: Configuration for subcharts - Each subchart has its own values section with service ports, namespace settings, and secret configurations
- **Template files**: Individual resource definitions - Umbrella chart had deployment.yaml, service.yaml, ingress.yaml templates that referenced non-existent values

**Desired Outcome:** A clear, industry-standard approach for structuring Helm umbrella charts.

### **Important Consideration - External AI Access:**
**Research AIs typically do NOT have access to your project files.** When mentioning file context, you must:
- **Describe file contents** rather than just referencing file names
- **Include relevant code snippets** or configuration examples
- **Provide context** about what each file does and how they interact
- **Use code blocks** to share critical configuration or code sections

### **Tips for Effective Research Prompts:**
- Be specific about the technology stack and version
- Include error messages or specific symptoms
- Mention what you've already tried
- Specify whether you're looking for best practices, troubleshooting, or architectural guidance
- Include relevant code snippets or configuration examples when possible
- **Always assume the AI cannot access your files** - describe file contents explicitly