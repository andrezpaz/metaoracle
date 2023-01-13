const { appendFile, writeFileSync } = require('fs');
const oracledb = require('oracledb');


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
                                                               'BZ10213')`
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

function runApiUnifi(filePHP, arg1, arg2) {
    var spawn = require('child_process').spawn;
    var process = spawn('php', [`/etc/UniFi-API-client/${filePHP}`, arg1, arg2]);

    return new Promise(resolve =>{
        function messageHandler(jData) {
            if (jData) {
                resolve(JSON.parse(jData))
                process.off('message', messageHandler)
            }
        }
        process.stdout.on('data', messageHandler);
    })
}

function returnDateNow(month) {
    let  dateNow = new Date();
    let dateFormat = dateNow.getDate()+'-'+(dateNow.getMonth()+1)+'-'+dateNow.getFullYear();
    let numberOfMonth = month;
    if (month === 12) numberOfMonth = 0;
   
    let nameOfMonth = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return month ? nameOfMonth[numberOfMonth]:dateFormat;
}

async function executeCreateRevokeVoucher() {
    let vouchersCreated = await runApiUnifi('state_voucher.php');
    let peopleToCheck = await selectNamesMetadados(); 

    createVoucher(peopleToCheck, vouchersCreated);
    revokeVoucher(peopleToCheck, vouchersCreated);
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
    //console.log(voucherToCreate)
    //voucherToCreate.length = 2
    voucherToCreate.forEach(voucher => {
        console.log(voucher)
        //runApiUnifi('create_voucher.php', voucher);
    })
}

function revokeVoucher(peopleToCheck, vouchersCreated) {
    let voucherToRevoke = vouchersCreated.filter( (voucher) =>{
        
        let personFound = peopleToCheck.find( person => person.NOTE === voucher.note.split('#',2).join('#'))
        if (!personFound && voucher.admin_name === 'apiubnt') {
            return voucher
        }
    })
    console.log("Vouchers que serao revogados: ")
    //console.log(voucherToRevoke)
    voucherToRevoke.forEach(voucher =>{
        console.log(voucher._id)
        //runApiUnifi('revoke_voucher.php', voucher._id);
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
        sendMail('vouchersfuncionarios@bazei.com.br', 'andrez.paz@bazei.com.br', 'Vouchers de Wi-Fi criados - ' + returnDateNow(), bodyEmail);
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
    sendMail('🎂️ Lista de aniversários 👻" <aniversariantes@bazei.com.br>', 'andrez.paz@bazei.com.br', 'Aniversariantes do Mês - '+returnDateNow(monthNext), 'Em anexo', nameFile, `./${nameFile}`)
}

function testeExec() {
    console.log("Teste de execucao");
}

module.exports = {testeExec, sendNamesBirthday, sendVouchersToEmail, executeCreateRevokeVoucher};