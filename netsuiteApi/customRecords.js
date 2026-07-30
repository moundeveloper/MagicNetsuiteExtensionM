(()=>{window.getCustomRecords=async t=>{const{query:e}=t,r={query:`
SELECT
    Name,
    ScriptID,
    InternalID,
    Description,
    BUILTIN.DF( Owner ) AS Owner,
FROM
    CustomRecordType
`},s=(await e.runSuiteQL.promise(r)).asMappedResults();return console.log("Custom Records: ",s.length),s};window.getCustomRecordUrl=(t,{recordId:e})=>{const{url:o}=t;return"https://"+o.resolveDomain({hostType:o.HostType.APPLICATION})+"/app/common/custom/custrecord.nl?id="+e};window.getCustomRecordListUrl=(t,{recordId:e})=>{const{url:o}=t;return`https://${o.resolveDomain({hostType:o.HostType.APPLICATION})}/app/common/custom/custrecordentrylist.nl?rectype=${e}`};window.getCurrentRecordIdType=t=>{const{currentRecord:e}=t,o=e.get(),r={id:o.id,type:o.type};return console.log("Current Record Data:",r),r};window.getCurrentUser=({runtime:t})=>{const e=t.getCurrentUser();return{id:e.id,name:e.name,email:e.email,role:e.role,roleId:e.roleId,location:e.location,locationId:e.locationId,department:e.department,departmentId:e.departmentId,subsidiary:e.subsidiary,subsidiaryId:e.subsidiaryId}};window.getAllRecordTypes=({record:t,query:e})=>{const o=t.Type,r=Object.entries(o).map(([c,d])=>{const u=c.toLowerCase().split("_").map(([i,...l])=>i.toUpperCase()+l.join("")).join(" "),a=d.toLowerCase();return{name:u,id:a}});return[...e.runSuiteQL({query:`SELECT
	CustomRecordType.name,
	CustomRecordType.scriptId as id,
	FROM
	CustomRecordType
`}).asMappedResults(),...r]};})();
