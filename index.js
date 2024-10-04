const { appendFile, writeFileSync } = require('fs');
const oracledb = require('oracledb');
const parse = require('csv-parse');


async function connectionOracle() {
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    require('dotenv').config();
    let conn = await oracledb.getConnection({ user: process.env.DB_USER, password: process.env.DB_PASS, connectionString: process.env.DB_HOST});
    return conn;
}

async function queryMetadados(query) {
    let connection;
    try {
        connection = await connectionOracle();
        const result = await connection.execute(
            query,
        [],
    );
    return result.rows;
    } catch (err) {
        console.log(err);
    } finally {
        if(connection) {
            try {
                await connection.close();
            } catch (err) {
            console.log(err);
            }
        }
    }
}

function selectNamesMetadados() {
    let sql = `SELECT DISTINCT(REPLACE(rhpessoas.nome, ' ', ''))||'#'||rhcontratos.contrato as note
                 FROM rhcontratos, rhpessoas, rhsetores, rhcentroscusto1, rhcentroscusto2
                WHERE rhcontratos.pessoa                   = rhpessoas.pessoa
                  AND rhcontratos.setor                    = rhsetores.setor
                  AND rhcentroscusto1.centrocusto1         = rhcontratos.centrocusto1
                  AND rhcentroscusto2.centrocusto2         = rhcontratos.centrocusto2
                  AND rhcontratos.situacao                 in (1,2)
                  AND rhcentroscusto2.centrocusto2         in ( 'BZ10307', 'BZ10218', 'BZ10402', 'BZ10301', 'BZ10310', 
                                                               'BZ10305', 'BZ10306', 'BZ10309', 'BZ10311', 'BZ10302',
                                                               'BZ10213', 'BZ10401', 'BZ10201', 'BZ10405')`
    return queryMetadados(sql);
}

function selectBrithdayNamesMetadados() {
    let sql = `SELECT to_char(rhpessoas.nascimento,'dd') dia, 
                      rhpessoas.nome, 
                      rhcentroscusto2.descricao40 centrocusto
                 FROM rhcontratos, rhpessoas, rhsetores, rhcentroscusto1, rhcentroscusto2
                WHERE rhcontratos.pessoa                   = rhpessoas.pessoa
                  AND rhcontratos.setor                    = rhsetores.setor
                  AND rhcentroscusto1.centrocusto1         = rhcontratos.centrocusto1
                  AND rhcentroscusto2.centrocusto2         = rhcontratos.centrocusto2
                  AND rhcontratos.situacao                 in (1,2)
                  AND to_char(rhpessoas.nascimento,'mm')   = to_char(add_months(sysdate,+1), 'mm')
             ORDER BY to_char(rhpessoas.nascimento,'dd')`
    return queryMetadados(sql);
}

function selectNamesHiredDay() {
    let sql = `SELECT rhpessoas.nome, rhpessoas.pessoa, rhcontratos.contrato,
                      rhusuarios.nomeusuario,
                      rhcentroscusto2.descricao40 centrocusto,
                      rhcontratos.dataadmissao
                 FROM rhcontratos, rhpessoas, rhusuarios, rhcentroscusto2
                WHERE rhcontratos.situacao          in (1,2)
                  AND rhcontratos.pessoa            = rhpessoas.pessoa
                  AND rhpessoas.empresa             = rhusuarios.empresa
                  AND rhpessoas.pessoa              = rhusuarios.pessoa
                  AND rhcentroscusto2.centrocusto2  = rhcontratos.centrocusto2
                  AND to_char(rhcontratos.dataadmissao, 'dd/mm/yyyy')   = to_char(sysdate, 'dd/mm/yyyy')`
    return queryMetadados(sql)
}

function selectNamesFiredDay() {
    let sql = `SELECT rhpessoas.nome, rhpessoas.pessoa, rhcontratos.contrato,
                      rhusuarios.nomeusuario,
                      rhcentroscusto2.descricao40 centrocusto,
                      rhcontratos.datarescisao
                 FROM rhcontratos, rhpessoas, rhusuarios, rhcentroscusto2
                WHERE rhcontratos.situacao          in (1,2)
                  AND rhcontratos.pessoa            = rhpessoas.pessoa
                  AND rhpessoas.empresa             = rhusuarios.empresa
                  AND rhpessoas.pessoa              = rhusuarios.pessoa
                  AND rhcentroscusto2.centrocusto2  = rhcontratos.centrocusto2
                  AND to_char(rhcontratos.datarescisao, 'dd/mm/yyyy')   = to_char(sysdate, 'dd/mm/yyyy')`
    return queryMetadados(sql)
}

const { spawn } = require('child_process');

function runApiUnifi(filePHP, arg1, arg2) {
    return new Promise((resolve, reject) => {
        const process = spawn('php', [`/etc/UniFi-API-client/${filePHP}`, arg1, arg2]);

        let output = ''; // Variável para acumular os dados

        // Acumula os dados recebidos
        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        // Captura qualquer erro gerado pelo processo PHP
        process.stderr.on('data', (data) => {
            console.error(`Erro no processo PHP: ${data}`);
        });

        // Quando o processo termina, tenta fazer o parse do JSON acumulado
        process.on('close', () => {
            try {
                const parsedData = JSON.parse(output);
                resolve(parsedData);
            } catch (error) {
                reject(new Error(`Falha ao fazer parse do JSON: ${error.message}\nSaída: ${output}`));
            }
        });
    });
}

function returnDateNow(month) {
    let  dateNow = new Date();
    let dateFormat = dateNow.getDate()+'-'+(dateNow.getMonth()+1)+'-'+dateNow.getFullYear();
    let numberOfMonth = month;
    if (month === 12) numberOfMonth = 0;
   
    let nameOfMonth = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return month ? nameOfMonth[numberOfMonth]:dateFormat;
}

function checkDaysVoucher(voucherCreated, daysToCheck) {
    let voucherWeeek = voucherCreated.find(voucher => voucher.note.split('#',2).join('#') === "VisitanteSemenal");
    let dateVoucher = voucherWeeek[0].note.split('#')[2].split('-');
    let dateVoucherFormat = new Date(dateVoucher[1] + '-' + dateVoucher[0] + '-' + dateVoucher[2]);
    let dateNow = new Date();
    let diffDays = Math.ceil(( dateNow.getTime() - dateVoucherFormat.getTime() ) / (1000 * 3600 * 24));
    if (diffDays >= daysToCheck) {
        return true
    } else {
        return false
    }
}

function createWeekVoucher() {

}

async function executeCreateRevokeVoucheGuests() {
    let vouchersCreated = await runApiUnifi('state_voucher.php');
    let guestsConnected = await listGuests();
    let vouchersCreatedConnected = vouchersCreated.concat(guestsConnected);
    let voucherWeek = checkDaysVoucher(vouchersCreatedConnected, 7) ? createWeekVoucher():'';
}

async function executeCreateRevokeVoucher() {
    let vouchersCreated = await runApiUnifi('state_voucher.php');
    let guestsConnected = await listGuests();
    let peopleToCheck = await selectNamesMetadados();

    createVoucher(peopleToCheck, vouchersCreated.concat(guestsConnected));
    revokeVoucher(peopleToCheck, vouchersCreated.concat(guestsConnected));
}

async function listGuests() {
    let guestsConnected = await runApiUnifi('list_guests.php');
    let guests = guestsConnected.map((element)=>{
        return {"note":element.name, "mac":element.mac, "admin_name":"apiubnt"}
    })
    return guests
}


function createVoucher(peopleToCheck, vouchersCreated) {
    let voucherToCreate = peopleToCheck.reduce( (acumula, person) => {
        let voucherFound = vouchersCreated.find(voucher => voucher.note.split('#',2).join('#') === person.NOTE)
        if (!voucherFound) {
            let  dateNow = returnDateNow();
            let notesVoucher = person.NOTE+'#'+dateNow;
            acumula.push(notesVoucher)
        }
        return acumula
    },[]);
    
    console.log("Vouchers que serao Criados : ")
    //voucherToCreate.length = 2
    voucherToCreate.forEach(voucher => {
        console.log(voucher)
        runApiUnifi('create_voucher.php', voucher);
    })
}

function revokeVoucher(peopleToCheck, vouchersCreated) {
    let voucherToRevoke = vouchersCreated.filter( (voucher) =>{
        
        let personFound = peopleToCheck.find( person => person.NOTE === voucher.note.split('#',2).join('#'))
        
        if (!personFound && voucher.admin_name === 'apiubnt' && voucher.note.split("#").length > 2 ) {
            return voucher
        }
    })
    console.log("Vouchers que serao revogados: ")
    voucherToRevoke.forEach(voucher =>{
        console.log(voucher.note)
        if (voucher.mac) {
            runApiUnifi('disconnect_guest.php', voucher.mac)
        } else {
            runApiUnifi('revoke_voucher.php', voucher._id);
        }
    })
}

function sendMail(from, to, subject, msgBody, filename, path) {
    require('dotenv').config();
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        service: process.env.MAIL_SERVICE,
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS
        }
    })
    let attach = []
    if (path) {
        attach = [
            {
                filename: filename,
                path: path
            }
        ]
    }
    var mailOptions = {
        from: from,
        to: to,
        subject: subject,
        html: msgBody,
        attachments: attach
    }

    transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email send: ' + info.response)
        }
    })
}

async function sendVouchersToEmail() {
    let vouchersCreated = await runApiUnifi('state_voucher.php'); 
    let bodyEmail = vouchersCreated.reduce((acumula, voucher)=>{
        let splitValue = voucher.note.split('#')
        let name = splitValue[0];
        let ID = splitValue[1];
        let timeCreate = splitValue[2];
        let timeNow = returnDateNow();
        if (timeCreate === timeNow && name && ID) {
            acumula = acumula + '<p> Nome: '+ name+ ' <br> Codigo Meta: ' + ID + ' <br> Senha Wi-Fi: ' + voucher.code + ' </p> // -------------------------- //';
        }
        return acumula;
    },'<html><body> <h4> Abaixo vouchers de WiFi dos funcionários recém cadastrados no sistema Metadados </h4>') 
    if (bodyEmail.includes('Senha Wi-Fi')) {
        bodyEmail = bodyEmail + '<footer><p><i>Mensagem enviada de forma automática</i></p></footer></body></html>'
        sendMail('💻️ Internet para Funcionários 📱️ <vouchersfuncionarios@bazei.com.br>', "andrez.paz@bazei.com.br, luana.tessaro@bazei.com.br", 'Vouchers de Wi-Fi criados - ' + returnDateNow(), bodyEmail);
        writeFileSync('./mensagem.html', bodyEmail);
    }
}

async function sendUsersADMetaToEmail() { 
    let bodyEmail = '<html><body> <h4> Em anexo usuarios do PortalRH Metadados </h4>'
    let pathfile = process.env.PATH_FILE_AD_META_SYNC
    if (fs.existsSync(pathfile+'/arquivoUsers.csv')) {
        bodyEmail = bodyEmail + '<footer><p><i>Mensagem enviada de forma automática</i></p></footer></body></html>'
        sendMail('💻️ Acessos Portal RH 📱️ <portalrh@bazei.com.br>', "andrez.paz@bazei.com.br", 'Vouchers de Wi-Fi criados - ' + returnDateNow(), bodyEmail);
        writeFileSync('./mensagem.html', bodyEmail);
    }
}

async function sendNamesBirthday() {
    const reader = require('xlsx');
    const fileXLS = reader.utils.book_new();
    let namesBirthday = await selectBrithdayNamesMetadados(); 
    const ws = reader.utils.json_to_sheet(namesBirthday);
    reader.utils.book_append_sheet(fileXLS,ws, "Sheet1");
    let monthNext = new Date().getMonth()+1;
    let nameFile = 'Aniversariantes-' + returnDateNow(monthNext) + '.xlsx';
    reader.writeFile(fileXLS, `./${nameFile}`);
    sendMail('🎂️ Lista de aniversários 👻" <aniversariantes@bazei.com.br>', "andrez.paz@bazei.com.br, artes02@bazei.com.br, artes01@bazei.com.br, artes03@bazei.com.br", 'Aniversariantes do Mês - '+returnDateNow(monthNext), 'Em anexo', nameFile, `./${nameFile}`)
}

function testeExec() {
    console.log("Teste de execucao");
}

function createFileCSV(data) {
    
    // formata arquivo conforme necessidade
    let csvFormat = data.map((element)=>{
        let nomeDividido = element.NOME.split(" ")
        return {DisplayName:element.NOME,
                Description:element.PESSOA.toString() + '-' + element.CONTRATO.toString(),
                SamAccountName: element.NOMEUSUARIO,
                Department: element.CENTROCUSTO,
                GivenName: nomeDividido[0],
                Surname: nomeDividido[nomeDividido.length -1],
                UserPrincipalName: element.NOMEUSUARIO + '@bazei.local'
                }
    })

    // Convertendo dados para CSV
    const csvData = csvFormat.map(item => Object.values(item));

    // Adiciona o cabeçalho 
    csvData.unshift(Object.keys(csvFormat[0]));
    
    // Convertendo para string CSV
    const csvString = csvData.map(row => row.join(';')).join('\n');

    return csvString;
}

async function CreateFileNamesHiredDay() {
    let namesPeople = await selectNamesHiredDay();
    require('dotenv').config();
    let pathfile = process.env.PATH_FILE_AD_META_SYNC

    if (namesPeople.length > 0) {
        // Escrever no arquivo
        fs.writeFileSync(pathfile+'/contratadosSemanaMetadados.csv', createFileCSV(namesPeople));
        console.log('Arquivo CSV foi gravado com sucesso');
    } else {
        console.log('Sem dados para gerar o arquivo CSV dos contratados')
    }
}

async function CreateFileNamesFiredDay() {
    let namesPeople = await selectNamesFiredDay();
    require('dotenv').config();
    let pathfile = process.env.PATH_FILE_AD_META_SYNC

    if (namesPeople.length > 0) {
        // Escrever no arquivo
        fs.writeFileSync(pathfile+'/desligadosSemanaMetadados.csv', createFileCSV(namesPeople));
        console.log('Arquivo CSV foi gravado com sucesso');
    } else {
        console.log('Sem dados para gerar o arquivo CSV dos contratados')
    }
}

module.exports = {testeExec, sendNamesBirthday, sendVouchersToEmail, executeCreateRevokeVoucher, CreateFileNamesHiredDay, CreateFileNamesFiredDay};