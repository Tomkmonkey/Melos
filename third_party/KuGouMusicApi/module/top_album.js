// 推荐专辑
const { apiver } = require('../util');

module.exports = (params, useAxios) => {
  const dataMap = {
    apiver,
    token: params?.token || params?.cookie?.token || '',
    // 上游要求 page/pagesize 为数字；HTTP query 传入的是字符串会返回
    // "request fileds type error"（见 Docker 部署适配）。
    page: Number(params?.page) || 1,
    pagesize: Number(params?.pagesize) || 30,
    withpriv: 1,
  };

  return useAxios({
    url: '/musicadservice/v1/mobile_newalbum_sp',
    method: 'POST',
    data: dataMap,
    encryptType: 'android',
    cookie: params?.cookie || {},
  });
};
