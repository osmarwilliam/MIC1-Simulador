class MIC1Assembler {
    constructor() {
        this.opcodes = {
            'LODD': 0x0000, 'STOD': 0x1000, 'ADDD': 0x2000, 'SUBD': 0x3000,
            'JPOS': 0x4000, 'JZER': 0x5000, 'JUMP': 0x6000, 'LOCO': 0x7000,
            'LODL': 0x8000, 'STOL': 0x9000, 'ADDL': 0xA000, 'SUBL': 0xB000,
            'JNEG': 0xC000, 'JNZE': 0xD000, 'CALL': 0xE000,
            'PSHI': 0xF000, 'POPI': 0xF200, 'PUSH': 0xF400, 'POP':  0xF600,
            'RETN': 0xF800, 'SWAP': 0xFA00, 'INSP': 0xFC00, 'DESP': 0xFE00,
            'HALT': 0xFFFF
        };
    }

    compile(text) {
        // Divide o texto em linhas
        const rawLines = text.split('\n');
        
        const labels = {};
        const instructions = [];
        let addressCounter = 0;

        for (let line of rawLines) {
            // Remove comentários (tudo depois de ;) e espaços extras
            let clean = line.split(';')[0].trim();
            if (!clean) continue; // Pula linhas vazias

            // Verifica se há declaração de label
            if (clean.includes(':')) {
                const parts = clean.split(':');
                const labelName = parts[0].trim();
                
                // Salva o endereço atual para este label
                labels[labelName] = addressCounter;
                
                // O resto da linha pode conter uma instrução (ex: "loop: LODD 10")
                clean = parts[1] ? parts[1].trim() : "";
            }

            // Se sobrou alguma instrução na linha, adiciona à lista
            if (clean) {
                instructions.push(clean);
                addressCounter++;
            }
        }

        const binaryCode = [];
        const errors = [];

        instructions.forEach((line, index) => {
            // Separa o comando e o operando por espaços
            const parts = line.replace(/\s+/g, ' ').split(' ');
            const mnemonic = parts[0].toUpperCase();
            
            // Verifica se é uma instrução válida
            if (this.opcodes.hasOwnProperty(mnemonic)) {
                const baseOpcode = this.opcodes[mnemonic];
                let finalInstr = baseOpcode;

                // Verifica quais instruções precisam de operando (valor ou endereço)
                const needsOperand = (baseOpcode < 0xF000) || (mnemonic === 'INSP') || (mnemonic === 'DESP');

                if (needsOperand) {
                    if (parts.length < 2) {
                        errors.push(`Erro linha ${index + 1}: '${mnemonic}' requer um valor ou label.`);
                        return;
                    }

                    const opStr = parts[1];
                    let val = 0;

                    // Tenta resolver o operando:
                    // 1. Verifica se é um Label conhecido
                    if (labels.hasOwnProperty(opStr)) {
                        val = labels[opStr];
                    } else {
                        // 2. Tenta converter para número
                        val = parseInt(opStr);
                        if (isNaN(val)) {
                            errors.push(`Erro linha ${index + 1}: Label ou valor inválido '${opStr}'.`);
                            return;
                        }
                    }

                    // Aplica a máscara correta para combinar Opcode + Operando
                    if (mnemonic === 'INSP' || mnemonic === 'DESP') {
                        // Estas usam apenas os 8 bits inferiores para o valor
                        finalInstr = baseOpcode | (val & 0xFF);
                    } else {
                        // As outras usam os 12 bits inferiores (endereços de memória)
                        finalInstr = baseOpcode | (val & 0xFFF);
                    }
                }

                binaryCode.push(finalInstr);

            } else {
                // Se não for um mnemônico, tenta processar como dado cru (número direto na memória)
                const val = parseInt(mnemonic);
                if (!isNaN(val)) {
                    binaryCode.push(val & 0xFFFF);
                } else {
                    if (labels.hasOwnProperty(mnemonic)) {
                        binaryCode.push(labels[mnemonic]);
                    } else {
                        errors.push(`Erro linha ${index + 1}: Comando desconhecido '${mnemonic}'`);
                    }
                }
            }
        });

        // Retorna o binário pronto e a lista de erros, se houver
        return { binary: binaryCode, errors: errors };
    }
}