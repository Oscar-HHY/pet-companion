#import <React/RCTBridgeModule.h>
                                                                                                                                          
@interface RCT_EXTERN_MODULE(CompanionActivityModule, NSObject)
                                                                                                                                          
RCT_EXTERN_METHOD(
  startActivity:(NSString *)payloadJson
  resolve:(RCTPromiseResolveBlock)resolve
  reject:(RCTPromiseRejectBlock)reject
)
                                                          
RCT_EXTERN_METHOD(
  updateActivity:(RCTPromiseResolveBlock)resolve
  reject:(RCTPromiseRejectBlock)reject
)
 
RCT_EXTERN_METHOD(
  stopActivity:(RCTPromiseResolveBlock)resolve
  reject:(RCTPromiseRejectBlock)reject
)
                                                                                                                                          
@end
