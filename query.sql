SELECT
    script.scriptfile,
    script.name,
    script.scripttype,
    scriptdeployment.primarykey,
    file.url
FROM
    scriptdeployment
    INNER JOIN script ON scriptdeployment.script = script.id
    INNER JOIN file ON script.scriptfile = file.id
WHERE
    scriptdeployment.recordtype = 'CUSTOMER'
    AND scriptdeployment.isdeployed = 'T'