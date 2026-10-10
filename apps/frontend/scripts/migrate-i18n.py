import os
import re
import json

# Paths
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOCALES_DIR = os.path.join(FRONTEND_DIR, "locales")
TR_JSON_PATH = os.path.join(LOCALES_DIR, "tr.json")

# Target files and their namespaces
TARGET_FILES = [
    {
        "path": os.path.join(FRONTEND_DIR, "app", "admin", "api", "page.tsx"),
        "namespace": "adminApi"
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "admin", "users", "page.tsx"),
        "namespace": "adminUsers"
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "documents", "page.tsx"),
        "namespace": "documents"
    },
    {
        "path": os.path.join(FRONTEND_DIR, "app", "field-reports", "page.tsx"),
        "namespace": "fieldReports"
    }
]

def main():
    print("Starting centralized i18n migration...")
    
    # Load existing tr.json
    if os.path.exists(TR_JSON_PATH):
        with open(TR_JSON_PATH, "r", encoding="utf-8") as f:
            try:
                translations = json.load(f)
            except json.JSONDecodeError:
                translations = {}
    else:
        translations = {}

    for target in TARGET_FILES:
        filepath = target["path"]
        namespace = target["namespace"]
        
        if not os.path.exists(filepath):
            print(f"File not found: {filepath}, skipping.")
            continue
            
        print(f"\nProcessing {os.path.basename(filepath)} (namespace: {namespace})...")
        
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            
        # 1. Match the `const T = { ... };` block
        # Matches const T = { <anything> };
        t_block_match = re.search(r'const T\s*=\s*\{([\s\S]*?)\};', content)
        if not t_block_match:
            print(f"No T block found in {os.path.basename(filepath)}!")
            continue
            
        t_block_body = t_block_match.group(1)
        
        # Extract keys and values from the T block body
        # Matches key: "value" or key: 'value' (including multi-line values)
        kv_pairs = re.findall(r'(\w+)\s*:\s*["\']([\s\S]*?)["\']\s*(?:,|$)', t_block_body)
        
        file_translations = {}
        for key, val in kv_pairs:
            # Clean up escape characters or formatting if any
            clean_val = val.strip().replace('\\n', '\n').replace('\\"', '"').replace("\\'", "'")
            file_translations[key] = clean_val
            
        # Store in global translations dict
        translations[namespace] = file_translations
        print(f"Extracted {len(file_translations)} translation keys.")
        
        # 2. Remove the `const T = { ... };` block from content
        content = content.replace(t_block_match.group(0), "")
        
        # 3. Add useTranslation import
        if "'use client'" in content:
            content = content.replace("'use client';", "'use client';\nimport { useTranslation } from '@/lib/i18n';")
        elif '"use client"' in content:
            content = content.replace('"use client";', '"use client";\nimport { useTranslation } from "@/lib/i18n";')
        else:
            # Fallback to top of file
            content = "import { useTranslation } from '@/lib/i18n';\n" + content
            
        # 4. Insert useTranslation hook declaration inside component
        func_match = re.search(r'export default function \w+\(.*?\)\s*\{', content)
        if func_match:
            matched_str = func_match.group(0)
            content = content.replace(matched_str, matched_str + "\n  const { t } = useTranslation();")
        else:
            print("Warning: Could not find default component function signature to inject hook!")
            
        # 5. Refactor T.key to t("namespace.key")
        for key in file_translations.keys():
            # Use regex with word boundaries to replace exactly T.key
            pattern = rf'\bT\.{key}\b'
            replacement = f't("{namespace}.{key}")'
            content = re.sub(pattern, replacement, content)
            
        # Save refactored component content
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
            
        print(f"Refactored {os.path.basename(filepath)} successfully.")

    # Save consolidated tr.json
    os.makedirs(LOCALES_DIR, exist_ok=True)
    with open(TR_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(translations, f, ensure_ascii=False, indent=2)
        
    print(f"\nSaved consolidated translations to: {TR_JSON_PATH}")
    print("i18n migration completed successfully!")

if __name__ == "__main__":
    main()
